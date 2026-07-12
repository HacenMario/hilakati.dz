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
const Notification = require('./models/Notification');

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

app.delete('/api/admin/salons/:id/reviews', adminAuthMiddleware, async (req, res) => {
    try {
        const salonId = req.params.id;
        
        // التحقق من وجود الصالون
        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: '❌ الصالون غير موجود' });
        }

        // حذف جميع التقييمات المرتبطة بهذا الصالون
        const result = await Review.deleteMany({ salonId: salonId });
        
        // تحديث تقييم الصالون إلى 0
        salon.rating = 0;
        salon.totalReviews = 0;
        await salon.save();

        res.json({
            message: `✅ تم حذف ${result.deletedCount} تقييم من صالون ${salon.name}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('❌ خطأ في حذف تقييمات الصالون:', error);
        res.status(500).json({ message: '❌ فشل في حذف التقييمات' });
    }
});

// ============================================================
// نسيان كلمة المرور (نسخة نظيفة)
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
            console.log('❌ نوع مستخدم غير صحيح:', userType);
            return res.status(400).json({ message: 'نوع المستخدم غير صحيح' });
        }

        if (!user) {
            console.log('❌ البريد غير مسجل:', email);
            return res.status(404).json({ message: 'البريد الإلكتروني غير مسجل' });
        }

        console.log('✅ تم العثور على المستخدم:', user._id);

        // إنشاء توكن إعادة تعيين
        const resetToken = jwt.sign(
            { id: user._id, userType },
            process.env.JWT_RESET_SECRET || 'reset_secret_key_change_me',
            { expiresIn: '30m' }
        );

        // إرجاع التوكن مباشرة (بدون إرسال بريد إلكتروني)
        console.log('🔑 تم إنشاء التوكن:', resetToken);

        res.json({
            message: '✅ تم التحقق من البريد، أدخل كلمة المرور الجديدة',
            resetToken: resetToken,
            userType: userType
        });

    } catch (error) {
        console.error('❌ خطأ في forgot-password:', error);
        // ✅ تأكد من إرسال رد حتى في حالة الخطأ
        res.status(500).json({
            message: 'فشل في إنشاء طلب إعادة التعيين',
            error: error.message
        });
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
// حذف حجز معين بواسطة المدير
// ============================================================
app.delete('/api/admin/appointments/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: 'الحجز غير موجود' });
        await appointment.deleteOne();
        res.json({ message: '✅ تم حذف الحجز بنجاح' });
    } catch (error) {
        res.status(500).json({ message: 'فشل في حذف الحجز' });
    }
});

// ============================================================
// مسارات المدير الإدارية
// ============================================================
app.get('/api/admin/stats', adminAuthMiddleware, async (req, res) => {
    try {
        const totalSalons = await Salon.countDocuments();
        const totalCustomers = await Customer.countDocuments();
        const totalAppointments = await Appointment.countDocuments();
        const pendingAppointments = await Appointment.countDocuments({ status: 'pending' });
        const totalReviews = await Review.countDocuments();
        const confirmedAppointments = await Appointment.find({ status: { $in: ['confirmed', 'completed'] } });
        const totalRevenue = confirmedAppointments.reduce((sum, a) => sum + (a.totalPrice || a.price || 0), 0);
        res.json({ totalSalons, totalCustomers, totalAppointments, pendingAppointments, totalReviews, totalRevenue });
    } catch (err) {
        res.status(500).json({ message: 'فشل جلب الإحصائيات' });
    }
});

app.get('/api/admin/salons', adminAuthMiddleware, async (req, res) => {
    const salons = await Salon.find().select('-password');
    res.json(salons);
});

app.get('/api/admin/salons/:id', adminAuthMiddleware, async (req, res) => {
    const salon = await Salon.findById(req.params.id).select('-password');
    if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });
    res.json(salon);
});

app.put('/api/admin/salons/:id', adminAuthMiddleware, async (req, res) => {
    const { name, city, address, phone } = req.body;
    const salon = await Salon.findByIdAndUpdate(req.params.id, { name, city, address, phone }, { new: true }).select('-password');
    res.json(salon);
});

app.delete('/api/admin/salons/:id', adminAuthMiddleware, async (req, res) => {
    await Salon.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الصالون' });
});

app.get('/api/admin/customers', adminAuthMiddleware, async (req, res) => {
    const customers = await Customer.find().select('-password');
    res.json(customers);
});

app.get('/api/admin/customers/:id', adminAuthMiddleware, async (req, res) => {
    const customer = await Customer.findById(req.params.id).select('-password');
    if (!customer) return res.status(404).json({ message: 'عميل غير موجود' });
    res.json(customer);
});

app.put('/api/admin/customers/:id', adminAuthMiddleware, async (req, res) => {
    const { name, email, phone } = req.body;
    const customer = await Customer.findByIdAndUpdate(req.params.id, { name, email, phone }, { new: true }).select('-password');
    res.json(customer);
});

app.delete('/api/admin/customers/:id', adminAuthMiddleware, async (req, res) => {
    await Customer.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف العميل' });
});

app.get('/api/admin/reviews', adminAuthMiddleware, async (req, res) => {
    const reviews = await Review.find().populate('salonId', 'name');
    res.json(reviews);
});

app.delete('/api/admin/reviews/:id', adminAuthMiddleware, async (req, res) => {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف التقييم' });
});

app.put('/api/admin/change-user-password', adminAuthMiddleware, async (req, res) => {
    const { userId, userType, newPassword } = req.body;
    if (!userId || !userType || !newPassword) return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
    if (newPassword.length < 6) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });

    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        if (userType === 'salon') {
            await Salon.findByIdAndUpdate(userId, { password: hashedPassword });
        } else if (userType === 'customer') {
            await Customer.findByIdAndUpdate(userId, { password: hashedPassword });
        } else {
            return res.status(400).json({ message: 'نوع المستخدم غير صحيح' });
        }

        res.json({ message: 'تم تغيير كلمة المرور بنجاح', newPassword });
    } catch (error) {
        res.status(500).json({ message: 'فشل تغيير كلمة المرور' });
    }
});
// ============================================================
// مسارات المدير الإضافية - تحسينات لوحة التحكم
// ============================================================

// 1. إحصائيات متقدمة (صالونات نشطة، حجوزات معلقة/مكتملة)
app.get('/api/admin/stats/advanced', adminAuthMiddleware, async (req, res) => {
    try {
        const totalSalons = await Salon.countDocuments();
        const activeSalons = await Salon.countDocuments({ isActive: { $ne: false } });
        const totalCustomers = await Customer.countDocuments();
        const totalAppointments = await Appointment.countDocuments();
        const pendingAppointments = await Appointment.countDocuments({ status: 'pending' });
        const completedAppointments = await Appointment.countDocuments({ status: 'completed' });
        const totalReviews = await Review.countDocuments();
        
        // إجمالي الإيرادات
        const confirmedAppointments = await Appointment.find({ status: { $in: ['confirmed', 'completed'] } });
        const totalRevenue = confirmedAppointments.reduce((sum, a) => sum + (a.totalPrice || a.price || 0), 0);
        
        res.json({
            totalSalons,
            activeSalons,
            totalCustomers,
            totalAppointments,
            pendingAppointments,
            completedAppointments,
            totalReviews,
            totalRevenue
        });
    } catch (error) {
        console.error('❌ خطأ في stats/advanced:', error);
        res.status(500).json({ message: 'فشل في جلب الإحصائيات المتقدمة' });
    }
});

// 2. تفعيل/تعطيل صالون
app.put('/api/admin/salons/:id/toggle', adminAuthMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findById(req.params.id);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });
        
        // تغيير الحالة
        salon.isActive = salon.isActive === false ? true : false;
        await salon.save();
        
        res.json({ 
            message: `تم ${salon.isActive ? 'تفعيل' : 'تعطيل'} الصالون ${salon.name}`,
            isActive: salon.isActive 
        });
    } catch (error) {
        console.error('❌ خطأ في toggle salon:', error);
        res.status(500).json({ message: 'فشل تغيير حالة الصالون' });
    }
});

// 3. حظر/إلغاء حظر عميل
app.put('/api/admin/customers/:id/toggle-block', adminAuthMiddleware, async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);
        if (!customer) return res.status(404).json({ message: 'عميل غير موجود' });
        
        customer.isBlocked = customer.isBlocked === true ? false : true;
        await customer.save();
        
        res.json({ 
            message: `تم ${customer.isBlocked ? 'حظر' : 'إلغاء حظر'} العميل ${customer.name}`,
            isBlocked: customer.isBlocked 
        });
    } catch (error) {
        console.error('❌ خطأ في toggle customer block:', error);
        res.status(500).json({ message: 'فشل تغيير حالة العميل' });
    }
});

// 4. جلب جميع الحجوزات (للمدير)
app.get('/api/admin/appointments', adminAuthMiddleware, async (req, res) => {
    try {
        const appointments = await Appointment.find()
            .populate('salonId', 'name')
            .populate('customerId', 'name')
            .sort({ createdAt: -1 });
        res.json(appointments);
    } catch (error) {
        console.error('❌ خطأ في admin/appointments:', error);
        res.status(500).json({ message: 'فشل في جلب الحجوزات' });
    }
});

// 5. إرسال إشعار جماعي لجميع الصالونات والعملاء
app.post('/api/admin/broadcast', adminAuthMiddleware, async (req, res) => {
    try {
        const { title, message } = req.body;
        if (!title || !message) {
            return res.status(400).json({ message: 'العنوان والنص مطلوبان' });
        }

        // جلب جميع المستخدمين
        const salons = await Salon.find().select('_id');
        const customers = await Customer.find().select('_id');
        
        // إنشاء إشعارات لكل مستخدم
        const notifications = [];
        
        salons.forEach(salon => {
            notifications.push({
                userId: salon._id,
                userType: 'salon',
                title,
                message,
                read: false,
                createdAt: new Date()
            });
        });
        
        customers.forEach(customer => {
            notifications.push({
                userId: customer._id,
                userType: 'customer',
                title,
                message,
                read: false,
                createdAt: new Date()
            });
        });
        
        // حفظ الإشعارات في قاعدة البيانات (إذا كان لديك نموذج Notification)
        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }
        
        // إرسال إشعار فوري عبر Socket.io للمستخدمين المتصلين
        const io = req.app.get('io');
        if (io) {
            // إرسال لكل صالون متصل
            salons.forEach(salon => {
                io.to(`salon-${salon._id}`).emit('new-notification', { title, message });
            });
            // إرسال لكل عميل متصل
            customers.forEach(customer => {
                io.to(`customer-${customer._id}`).emit('new-notification', { title, message });
            });
        }
        
        res.json({ 
            message: `✅ تم إرسال الإشعار إلى ${notifications.length} مستخدم`,
            count: notifications.length 
        });
        
    } catch (error) {
        console.error('❌ خطأ في broadcast:', error);
        res.status(500).json({ message: 'فشل إرسال الإشعارات' });
    }
});

// 6. حذف جميع التقييمات لصالون (نسخة محسنة)
app.delete('/api/admin/salons/:id/reviews', adminAuthMiddleware, async (req, res) => {
    try {
        const salonId = req.params.id;
        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: '❌ الصالون غير موجود' });
        }

        const result = await Review.deleteMany({ salonId: salonId });
        
        // تحديث تقييم الصالون إلى 0
        salon.rating = 0;
        salon.totalReviews = 0;
        await salon.save();

        res.json({
            message: `✅ تم حذف ${result.deletedCount} تقييم من صالون ${salon.name}`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('❌ خطأ في حذف تقييمات الصالون:', error);
        res.status(500).json({ message: '❌ فشل في حذف التقييمات' });
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

        // ============================================================
        // 1. جلب بيانات الصالون
        // ============================================================
        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: '❌ الصالون غير موجود' });
        }

        // ============================================================
        // 2. التحقق من ساعات العمل
        // ============================================================
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const selectedDate = new Date(date);
        const dayIndex = selectedDate.getDay();
        const dayName = dayNames[dayIndex];
        
        const dayHours = salon.hours ? salon.hours.get(dayName) : null;
        
        if (!dayHours || dayHours === 'مغلق' || dayHours === 'closed') {
            return res.status(400).json({
                message: `❌ الصالون مغلق يوم ${dayName}`
            });
        }

        const [openTime, closeTime] = dayHours.split('-').map(t => t.trim());
        
        if (time < openTime || time > closeTime) {
            return res.status(400).json({
                message: `❌ وقت الحجز (${time}) خارج ساعات العمل (${openTime} - ${closeTime})`
            });
        }

        // ============================================================
        // 3. التحقق من أن الوقت ليس في الماضي
        // ============================================================
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        if (date === today) {
            const [hours, minutes] = time.split(':').map(Number);
            const selectedDateTime = new Date();
            selectedDateTime.setHours(hours, minutes, 0, 0);
            
            // السماح بفارق 30 دقيقة على الأقل للحجز
            const minBookingTime = new Date(now.getTime() + 30 * 60 * 1000);
            
            if (selectedDateTime < minBookingTime) {
                return res.status(400).json({
                    message: `❌ لا يمكن الحجز في وقت مضى. يجب أن يكون الموعد بعد ${minBookingTime.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})} على الأقل`
                });
            }
        }

        // ============================================================
        // 4. التحقق من عدم وجود حجز مكرر في نفس الوقت
        // ============================================================
        const existingAppointment = await Appointment.findOne({
            salonId,
            date,
            time,
            status: { $in: ['pending', 'confirmed'] }
        });

        if (existingAppointment) {
            return res.status(409).json({
                message: `❌ هذا الموعد محجوز مسبقاً في ${date} الساعة ${time}`
            });
        }

        // ============================================================
        // 5. إنشاء الحجز
        // ============================================================
        const appointment = new Appointment({
            salonId, customerId, clientName, clientPhone, clientEmail,
            services, totalPrice, staff, date, time, payment, notes,
            recurring, status: 'pending'
        });
        await appointment.save();

        // ===== إنشاء إشعار للصالون =====
        try {
            const notification = new Notification({
                userId: salonId,
                userType: 'salon',
                title: '📅 حجز جديد',
                message: `حجز من ${clientName} في ${date} الساعة ${time}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();
            console.log(`✅ تم حفظ إشعار للصالون ${salonId}`);
            
            const io = req.app.get('io');
            if (io) {
                io.to(`salon-${salonId}`).emit('new-notification', {
                    title: '📅 حجز جديد',
                    message: `حجز من ${clientName} في ${date} الساعة ${time}`
                });
                console.log(`📡 تم إرسال إشعار عبر Socket.io للصالون ${salonId}`);
            }
        } catch (notifError) {
            console.error('❌ فشل إنشاء الإشعار:', notifError);
        }

        res.status(201).json({
            message: '✅ تم إرسال طلب الحجز بنجاح!',
            appointment
        });

    } catch (err) {
        console.error('❌ فشل إنشاء الحجز:', err);
        res.status(500).json({ message: '❌ فشل إنشاء الحجز' });
    }
});
// ============================================================
// تأكيد الحجز مع إشعار
// ============================================================
app.put('/api/appointments/:id/confirm', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        appointment.status = 'confirmed';
        await appointment.save();

        // ===== إشعار للعميل =====
        if (appointment.customerId) {
            try {
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '✅ تم تأكيد حجزك',
                    message: `تم تأكيد حجزك في ${appointment.date} الساعة ${appointment.time}`,
                    read: false
                });
                await notification.save();
                console.log(`✅ تم إرسال إشعار تأكيد للعميل ${appointment.customerId}`);
            } catch (err) {
                console.error('❌ فشل إرسال إشعار التأكيد:', err);
            }
        }

        res.json({ message: '✅ تم تأكيد الموعد' });
    } catch (error) {
        console.error('❌ خطأ في تأكيد الموعد:', error);
        res.status(500).json({ message: '❌ فشل تأكيد الموعد' });
    }
});

// ============================================================
// إكمال الحجز مع إشعار
// ============================================================
app.put('/api/appointments/:id/complete', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        appointment.status = 'completed';
        await appointment.save();

        // ===== إشعار للعميل =====
        if (appointment.customerId) {
            try {
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '✅ تم إكمال حجزك',
                    message: `تم إكمال حجزك في ${appointment.date} الساعة ${appointment.time}. شكراً لزيارتنا!`,
                    read: false
                });
                await notification.save();
                console.log(`✅ تم إرسال إشعار إكمال للعميل ${appointment.customerId}`);
            } catch (err) {
                console.error('❌ فشل إرسال إشعار الإكمال:', err);
            }
        }

        res.json({ message: '✅ تم إكمال الموعد' });
    } catch (error) {
        console.error('❌ خطأ في إكمال الموعد:', error);
        res.status(500).json({ message: '❌ فشل إكمال الموعد' });
    }
});

// ============================================================
// إلغاء الحجز مع إشعار
// ============================================================
app.put('/api/appointments/:id/cancel', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        appointment.status = 'cancelled';
        await appointment.save();

        // ===== إشعار للعميل =====
        if (appointment.customerId) {
            try {
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '❌ تم إلغاء حجزك',
                    message: `تم إلغاء حجزك في ${appointment.date} الساعة ${appointment.time}`,
                    read: false
                });
                await notification.save();
                console.log(`✅ تم إرسال إشعار إلغاء للعميل ${appointment.customerId}`);
            } catch (err) {
                console.error('❌ فشل إرسال إشعار الإلغاء:', err);
            }
        }

        res.json({ message: '✅ تم إلغاء الموعد' });
    } catch (error) {
        console.error('❌ خطأ في إلغاء الموعد:', error);
        res.status(500).json({ message: '❌ فشل إلغاء الموعد' });
    }
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
        
        // ============================================================
        // 1. التحقق من وجود العميل
        // ============================================================
        const customer = await Customer.findById(req.customerId);
        if (!customer) {
            return res.status(404).json({ message: '❌ عميل غير موجود' });
        }

        // ============================================================
        // 2. التحقق من أن العميل لديه حجز مكتمل أو مؤكد في هذا الصالون
        // ============================================================
        const hasBooking = await Appointment.findOne({
            customerId: req.customerId,
            salonId: salonId,
            status: { $in: ['confirmed', 'completed'] }
        });

        if (!hasBooking) {
            return res.status(403).json({
                message: '❌ لا يمكنك تقييم هذا الصالون دون حجز مكتمل أو مؤكد'
            });
        }

        // ============================================================
        // 3. التحقق من أن العميل لم يقم بتقييم هذا الصالون مسبقاً (اختياري)
        // ============================================================
        const existingReview = await Review.findOne({
            salonId: salonId,
            customerId: req.customerId
        });

        if (existingReview) {
            return res.status(409).json({
                message: '❌ لقد قمت بتقييم هذا الصالون مسبقاً'
            });
        }

        // ============================================================
        // 4. إنشاء التقييم الجديد
        // ============================================================
        const review = new Review({
            salonId,
            customerId: req.customerId,
            customerName: customer.name, // ✅ اسم العميل الحقيقي
            rating,
            comment,
            date: new Date().toISOString().split('T')[0]
        });
        await review.save();

        // ============================================================
        // 5. تحديث متوسط التقييمات في الصالون
        // ============================================================
        const reviews = await Review.find({ salonId });
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        await Salon.findByIdAndUpdate(salonId, {
            rating: Math.round(avg * 10) / 10,
            totalReviews: reviews.length
        });

        // ============================================================
        // 6. إرسال الرد
        // ============================================================
        res.status(201).json({
            message: '✅ تم إضافة التقييم بنجاح',
            review: review
        });

    } catch (err) {
        console.error('❌ فشل إضافة التقييم:', err);
        res.status(500).json({ message: '❌ فشل إضافة التقييم' });
    }
});

// ============================================================
// مسار الترحيب
// ============================================================
app.get('/', (req, res) => {
    res.send('🚀 مرحباً بك في API منصة حلاقتي!');
});

// ============================================================
// مسارات الإشعارات
// ============================================================
app.get('/api/notifications/salon', authMiddleware, async (req, res) => {
    try {
        console.log('📡 جلب إشعارات للصالون:', req.userId);
        const notifications = await Notification.find({ 
            userId: req.userId, 
            userType: 'salon' 
        }).sort({ createdAt: -1 }).limit(50);
        console.log('📦 عدد الإشعارات:', notifications.length);
        res.json(notifications);
    } catch (error) {
        console.error('❌ خطأ في جلب إشعارات الصالون:', error);
        res.status(500).json([]);
    }
});

app.get('/api/notifications/customer', customerAuthMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ 
            userId: req.customerId, 
            userType: 'customer' 
        }).sort({ createdAt: -1 }).limit(50);
        res.json(notifications);
    } catch (error) {
        res.status(500).json([]);
    }
});

app.get('/api/notifications/admin', adminAuthMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ 
            userType: 'admin' 
        }).sort({ createdAt: -1 }).limit(50);
        res.json(notifications);
    } catch (error) {
        res.status(500).json([]);
    }
});
// ============================================================
// مسارات الإشعارات الإضافية
// ============================================================

// تحديد إشعار واحد كمقروء
app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findOne({ _id: req.params.id, userId: req.userId });
        if (!notification) return res.status(404).json({ message: 'الإشعار غير موجود' });
        notification.read = true;
        await notification.save();
        res.json({ message: '✅ تم التحديث' });
    } catch (error) {
        res.status(500).json({ message: 'فشل التحديث' });
    }
});

// مسح جميع الإشعارات
app.delete('/api/notifications/clear', async (req, res) => {
    try {
        const { userId, userType } = req.body;
        if (!userId || !userType) {
            return res.status(400).json({ message: 'بيانات غير مكتملة' });
        }
        await Notification.deleteMany({ userId, userType });
        res.json({ message: '✅ تم مسح الإشعارات' });
    } catch (error) {
        console.error('❌ خطأ في clear notifications:', error);
        res.status(500).json({ message: 'فشل مسح الإشعارات' });
    }
});

// تحديد الكل كمقروء (موجود مسبقاً، تأكد من وجوده)
app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const { userId, userType } = req.body;
        if (!userId || !userType) {
            return res.status(400).json({ message: 'بيانات غير مكتملة' });
        }
        await Notification.updateMany({ userId, userType, read: false }, { read: true });
        res.json({ message: '✅ تم تحديد الكل كمقروء' });
    } catch (error) {
        console.error('❌ خطأ في read-all:', error);
        res.status(500).json({ message: 'فشل تحديث الإشعارات' });
    }
});
// ============================================================
// إرسال رسالة واتساب
// ============================================================
function sendWhatsApp(phone, message) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/213${cleanPhone}?text=${encodeURIComponent(message)}`;
    // نستخدم console.log لمحاكاة الإرسال (للتطوير)
    console.log(`📱 واتساب إلى ${phone}: ${message}`);
    console.log(`🔗 ${whatsappUrl}`);
    return whatsappUrl;
}

// في مسار إنشاء الحجز
app.post('/api/appointments/request', async (req, res) => {
    // ... الكود الموجود ...
    // بعد حفظ الحجز
    const salon = await Salon.findById(salonId);
    const message = `مرحباً ${clientName}، تم تأكيد حجزك في ${salon.name} بتاريخ ${date} الساعة ${time}. ننتظرك! 💈`;
    sendWhatsApp(clientPhone, message);
    // ...
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📡 Socket.io جاهز للإشعارات الفورية`);
});
