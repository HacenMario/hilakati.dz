require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);

// ============================================================
// Socket.io
// ============================================================
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
});

io.on('connection', (socket) => {
    console.log('🔌 عميل متصل:', socket.id);

    socket.on('join-salon', (salonId) => {
        socket.join(`salon-${salonId}`);
        console.log(`📌 صالون ${salonId} انضم`);
    });

    socket.on('join-customer', (customerId) => {
        socket.join(`customer-${customerId}`);
        console.log(`📌 عميل ${customerId} انضم`);
    });

    socket.on('disconnect', () => {
        console.log('🔌 عميل disconnected:', socket.id);
    });
});

app.set('io', io);

// ============================================================
// Middleware
// ============================================================
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================================
// الاتصال بقاعدة البيانات
// ============================================================
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB متصل'))
.catch(err => console.error('❌ MongoDB فشل:', err));

// ============================================================
// إعدادات البريد الإلكتروني
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ============================================================
// النماذج
// ============================================================
const Salon = require('./models/Salon');
const Customer = require('./models/Customer');
const Appointment = require('./models/Appointment');
const Review = require('./models/Review');
const Admin = require('./models/Admin');

// ============================================================
// Middleware للمصادقة
// ============================================================
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'غير مصرح' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'salon_secret_key');
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'توكن غير صالح' });
    }
}

function customerAuthMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'غير مصرح' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key');
        req.customerId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'توكن عميل غير صالح' });
    }
}

function adminAuthMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'غير مصرح' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET || 'admin_secret_key');
        req.adminId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: 'توكن مدير غير صالح' });
    }
}

// ============================================================
// مسارات المصادقة (صالون)
// ============================================================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, city, address, email, phone, password, desc, logo, salonType, isMobile, lat, lng } = req.body;
        if (!name || !city || !address || !email || !phone || !password) {
            return res.status(400).json({ message: 'جميع الحقول المطلوبة فارغة' });
        }
        const exist = await Salon.findOne({ email });
        if (exist) return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const salon = new Salon({ name, city, address, email, phone, password: hashedPassword, desc, logo, salonType, isMobile, lat, lng });
        await salon.save();

        const token = jwt.sign({ id: salon._id }, process.env.JWT_SECRET || 'salon_secret_key', { expiresIn: '7d' });
        res.status(201).json({ token, salonId: salon._id, name: salon.name });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل التسجيل' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const salon = await Salon.findOne({ email });
        if (!salon) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const valid = await bcrypt.compare(password, salon.password);
        if (!valid) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const token = jwt.sign({ id: salon._id }, process.env.JWT_SECRET || 'salon_secret_key', { expiresIn: '7d' });
        res.json({ token, salonId: salon._id, name: salon.name });
    } catch (err) {
        res.status(500).json({ message: 'فشل تسجيل الدخول' });
    }
});

app.put('/api/auth/change-password', authMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const salon = await Salon.findById(req.userId);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });
        const valid = await bcrypt.compare(oldPassword, salon.password);
        if (!valid) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await Salon.findByIdAndUpdate(req.userId, { password: hashedPassword });
        res.json({ message: 'تم تغيير كلمة المرور' });
    } catch (err) {
        res.status(500).json({ message: 'فشل تغيير كلمة المرور' });
    }
});

// ============================================================
// مسارات المصادقة (عميل)
// ============================================================
app.post('/api/customer/auth/register', async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;
        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }
        const exist = await Customer.findOne({ email });
        if (exist) return res.status(400).json({ message: 'البريد الإلكتروني مسجل مسبقاً' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const customer = new Customer({ name, email, phone, password: hashedPassword });
        await customer.save();

        const token = jwt.sign({ id: customer._id }, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key', { expiresIn: '7d' });
        res.status(201).json({ token, customerId: customer._id, name: customer.name });
    } catch (err) {
        res.status(500).json({ message: 'فشل التسجيل' });
    }
});

app.post('/api/customer/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const customer = await Customer.findOne({ email });
        if (!customer) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const valid = await bcrypt.compare(password, customer.password);
        if (!valid) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const token = jwt.sign({ id: customer._id }, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key', { expiresIn: '7d' });
        res.json({ token, customerId: customer._id, name: customer.name });
    } catch (err) {
        res.status(500).json({ message: 'فشل تسجيل الدخول' });
    }
});

app.get('/api/customer/auth/profile', customerAuthMiddleware, async (req, res) => {
    const customer = await Customer.findById(req.customerId).select('-password');
    if (!customer) return res.status(404).json({ message: 'عميل غير موجود' });
    res.json(customer);
});

app.put('/api/customer/auth/profile', customerAuthMiddleware, async (req, res) => {
    const { name, email, phone } = req.body;
    try {
        const customer = await Customer.findByIdAndUpdate(req.customerId, { name, email, phone }, { new: true }).select('-password');
        res.json(customer);
    } catch (err) {
        res.status(500).json({ message: 'فشل تحديث الملف الشخصي' });
    }
});

app.put('/api/customer/auth/change-password', customerAuthMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const customer = await Customer.findById(req.customerId);
        if (!customer) return res.status(404).json({ message: 'عميل غير موجود' });
        const valid = await bcrypt.compare(oldPassword, customer.password);
        if (!valid) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await Customer.findByIdAndUpdate(req.customerId, { password: hashedPassword });
        res.json({ message: 'تم تغيير كلمة المرور' });
    } catch (err) {
        res.status(500).json({ message: 'فشل تغيير كلمة المرور' });
    }
});

app.delete('/api/customer/auth/me', customerAuthMiddleware, async (req, res) => {
    try {
        await Customer.findByIdAndDelete(req.customerId);
        res.json({ message: 'تم حذف الحساب' });
    } catch (err) {
        res.status(500).json({ message: 'فشل الحذف' });
    }
});

// ============================================================
// مسارات المدير
// ============================================================
app.post('/api/admin/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await Admin.findOne({ email });
        if (!admin) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const valid = await bcrypt.compare(password, admin.password);
        if (!valid) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        const token = jwt.sign({ id: admin._id }, process.env.JWT_ADMIN_SECRET || 'admin_secret_key', { expiresIn: '7d' });
        res.json({ token, adminId: admin._id });
    } catch (err) {
        res.status(500).json({ message: 'فشل تسجيل الدخول' });
    }
});

app.put('/api/admin/auth/change-password', adminAuthMiddleware, async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    try {
        const admin = await Admin.findById(req.adminId);
        if (!admin) return res.status(404).json({ message: 'مدير غير موجود' });
        const valid = await bcrypt.compare(oldPassword, admin.password);
        if (!valid) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await Admin.findByIdAndUpdate(req.adminId, { password: hashedPassword });
        res.json({ message: 'تم تغيير كلمة المرور' });
    } catch (err) {
        res.status(500).json({ message: 'فشل تغيير كلمة المرور' });
    }
});

// ============================================================
// نسيان كلمة المرور
// ============================================================
// ============================================================
// نسيان كلمة المرور
// ============================================================
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email, userType } = req.body;
    console.log('📧 طلب إعادة تعيين كلمة المرور:', email, userType);

    try {
        let user;
        if (userType === 'salon') {
            user = await Salon.findOne({ email });
        } else if (userType === 'customer') {
            user = await Customer.findOne({ email });
        } else {
            return res.status(400).json({ message: 'نوع المستخدم غير صحيح' });
        }

        if (!user) {
            return res.status(404).json({ message: 'البريد الإلكتروني غير مسجل' });
        }

        const resetToken = jwt.sign(
            { id: user._id, userType },
            process.env.JWT_RESET_SECRET || 'reset_secret_key_change_me',
            { expiresIn: '30m' }
        );

        const resetUrl = `${process.env.FRONTEND_URL || 'https://halakati-project.vercel.app'}?token=${resetToken}&userType=${userType}`;

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 30 * 60 * 1000;
        await user.save();

        // إرسال البريد الإلكتروني (اختياري)
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            try {
                await transporter.sendMail({
                    from: `"حلاقتي" <${process.env.EMAIL_USER}>`,
                    to: email,
                    subject: 'إعادة تعيين كلمة المرور - حلاقتي',
                    html: `
                        <div dir="rtl" style="font-family: 'Tajawal', sans-serif; text-align: right; background: #f8f9fa; padding: 20px; border-radius: 10px;">
                            <h3 style="color: #f5b042;">طلب إعادة تعيين كلمة المرور</h3>
                            <p>مرحباً،</p>
                            <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في منصة <strong>حلاقتي</strong>.</p>
                            <p>لتغيير كلمة المرور، اضغط على الرابط أدناه (صالح لمدة 30 دقيقة):</p>
                            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #f5b042; color: #1a1a2e; text-decoration: none; border-radius: 50px; font-weight: bold; margin: 15px 0;">إعادة تعيين كلمة المرور</a>
                            <p>إذا لم تطلب ذلك، يرجى تجاهل هذا البريد الإلكتروني.</p>
                            <p>شكراً لك،<br>فريق حلاقتي</p>
                        </div>
                    `
                });
                console.log('✅ تم إرسال البريد الإلكتروني إلى:', email);
            } catch (emailError) {
                console.error('❌ فشل إرسال البريد الإلكتروني:', emailError);
            }
        } else {
            console.log('🔑 رابط إعادة التعيين (للتطوير):', resetUrl);
        }

        res.json({
            message: '✅ تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني',
            resetLink: process.env.NODE_ENV === 'development' ? resetUrl : undefined
        });

    } catch (error) {
        console.error('❌ خطأ في forgot-password:', error);
        res.status(500).json({ message: 'فشل في إرسال البريد الإلكتروني' });
    }
});

// ============================================================
// إعادة تعيين كلمة المرور
// ============================================================
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        const decoded = jwt.verify(token, process.env.JWT_RESET_SECRET || 'reset_secret_key_change_me');
        const { id, userType } = decoded;

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        if (userType === 'salon') {
            const salon = await Salon.findByIdAndUpdate(id, { password: hashedPassword });
            if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });
        } else if (userType === 'customer') {
            const customer = await Customer.findByIdAndUpdate(id, { password: hashedPassword });
            if (!customer) return res.status(404).json({ message: 'عميل غير موجود' });
        } else {
            return res.status(400).json({ message: 'نوع المستخدم غير صالح' });
        }

        res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'انتهت صلاحية رابط إعادة التعيين' });
        }
        res.status(400).json({ message: 'الرابط غير صالح' });
    }
});

// ============================================================
// الصالونات العامة
// ============================================================
app.get('/api/salons', async (req, res) => {
    const salons = await Salon.find().select('-password');
    res.json(salons);
});

app.get('/api/salons/:id', async (req, res) => {
    const salon = await Salon.findById(req.params.id).select('-password');
    if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });
    res.json(salon);
});

app.put('/api/salons/:id/services', authMiddleware, async (req, res) => {
    const salon = await Salon.findByIdAndUpdate(req.params.id, { services: req.body.services }, { new: true });
    res.json(salon);
});

app.put('/api/salons/:id/staff', authMiddleware, async (req, res) => {
    const salon = await Salon.findByIdAndUpdate(req.params.id, { staff: req.body.staff }, { new: true });
    res.json(salon);
});

app.put('/api/salons/:id/hours', authMiddleware, async (req, res) => {
    const salon = await Salon.findByIdAndUpdate(req.params.id, { hours: req.body.hours }, { new: true });
    res.json(salon);
});

app.put('/api/salons/:id/settings', authMiddleware, async (req, res) => {
    const updateData = req.body;
    const salon = await Salon.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(salon);
});

app.delete('/api/salons/me', authMiddleware, async (req, res) => {
    await Salon.findByIdAndDelete(req.userId);
    res.json({ message: 'تم حذف الصالون' });
});

// ============================================================
// الحجوزات
// ============================================================
app.get('/api/appointments', authMiddleware, async (req, res) => {
    const appointments = await Appointment.find({ salonId: req.userId });
    res.json(appointments);
});

app.get('/api/appointments/my', customerAuthMiddleware, async (req, res) => {
    const appointments = await Appointment.find({ customerId: req.customerId }).populate('salonId', 'name');
    res.json(appointments);
});

app.get('/api/appointments/client/:phone', async (req, res) => {
    const appointments = await Appointment.find({ clientPhone: req.params.phone }).populate('salonId', 'name');
    res.json(appointments);
});

app.post('/api/appointments/request', async (req, res) => {
    try {
        const { salonId, customerId, clientName, clientPhone, clientEmail, services, totalPrice, staff, date, time, payment, notes, recurring } = req.body;
        const appointment = new Appointment({
            salonId, customerId, clientName, clientPhone, clientEmail, services, totalPrice, staff, date, time, payment, notes, recurring, status: 'pending'
        });
        await appointment.save();
        res.status(201).json(appointment);
    } catch (err) {
        res.status(500).json({ message: 'فشل إنشاء الحجز' });
    }
});

app.put('/api/appointments/:id/confirm', authMiddleware, async (req, res) => {
    await Appointment.findByIdAndUpdate(req.params.id, { status: 'confirmed' });
    res.json({ message: 'تم تأكيد الموعد' });
});

app.put('/api/appointments/:id/complete', authMiddleware, async (req, res) => {
    await Appointment.findByIdAndUpdate(req.params.id, { status: 'completed' });
    res.json({ message: 'تم إكمال الموعد' });
});

app.put('/api/appointments/:id/cancel', authMiddleware, async (req, res) => {
    await Appointment.findByIdAndUpdate(req.params.id, { status: 'cancelled' });
    res.json({ message: 'تم إلغاء الموعد' });
});

// ============================================================
// التقييمات
// ============================================================
app.get('/api/reviews/salon/:salonId', async (req, res) => {
    const reviews = await Review.find({ salonId: req.params.salonId });
    res.json(reviews);
});

app.post('/api/reviews', customerAuthMiddleware, async (req, res) => {
    try {
        const { salonId, rating, comment } = req.body;
        const review = new Review({
            salonId,
            customerId: req.customerId,
            customerName: req.body.customerName || 'عميل',
            rating,
            comment,
            date: new Date().toISOString().split('T')[0]
        });
        await review.save();

        const reviews = await Review.find({ salonId });
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        await Salon.findByIdAndUpdate(salonId, { rating: Math.round(avg * 10) / 10, totalReviews: reviews.length });

        res.status(201).json(review);
    } catch (err) {
        res.status(500).json({ message: 'فشل إضافة التقييم' });
    }
});

// ============================================================
// الإشعارات
// ============================================================
app.get('/api/notifications/salon', authMiddleware, (req, res) => res.json([]));
app.get('/api/notifications/customer', customerAuthMiddleware, (req, res) => res.json([]));
app.get('/api/notifications/admin', adminAuthMiddleware, (req, res) => res.json([]));
app.put('/api/notifications/read-all', (req, res) => res.json({ message: 'تم' }));

// ============================================================
// مسار الترحيب
// ============================================================
app.get('/', (req, res) => {
    res.send('🚀 مرحباً بك في API منصة حلاقتي!');
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📡 Socket.io جاهز للإشعارات الفورية`);
});
