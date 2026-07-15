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
// Passport.js - Google OAuth
// ============================================================
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

// ===== إعدادات الجلسة =====
app.use(session({
    secret: process.env.SESSION_SECRET || 'session_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // في الإنتاج استخدم true مع HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// ===== استراتيجية Google =====
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://halakati-project.onrender.com/api/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        console.log('🔍 Google Profile:', profile);

        // 1. البحث عن مستخدم موجود
        let customer = await Customer.findOne({ email: profile.emails[0].value });

        if (customer) {
            // 2. إذا كان موجوداً، تحديث googleId إذا لم يكن موجوداً
            if (!customer.googleId) {
                customer.googleId = profile.id;
                customer.avatar = profile.photos?.[0]?.value || '';
                await customer.save();
            }
            return done(null, customer);
        }

        // 3. إذا لم يكن موجوداً، إنشاء مستخدم جديد
        customer = new Customer({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value || '',
            isVerified: true,
            password: null // لا كلمة مرور لأنه يستخدم Google
        });
        await customer.save();

        return done(null, customer);

    } catch (err) {
        console.error('❌ Google Strategy Error:', err);
        return done(err, null);
    }
}));

// ===== Serialize / Deserialize =====
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await Customer.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
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
    if (!token) {
        return res.status(401).json({ message: '❌ غير مصرح' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'salon_secret_key');
        req.userId = decoded.id;
        next();
    } catch (err) {
        res.status(401).json({ message: '❌ توكن غير صالح' });
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

const staffRoutes = require('./routes/staff');
const inventoryRoutes = require('./routes/inventory');
const couponRoutes = require('./routes/coupons');
const quoteRoutes = require('./routes/quotes');

// ✅ استخدام authMiddleware للتحقق من الصلاحية
app.use('/api/staff', authMiddleware, staffRoutes);
app.use('/api/inventory', authMiddleware, inventoryRoutes);
app.use('/api/coupons', authMiddleware, couponRoutes);
app.use('/api/quotes', authMiddleware, quoteRoutes);

// ============================================================
// مسارات المصادقة (صالون)
// ============================================================
// ✅ تسجيل صالون جديد (بحالة pending_approval)
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

        const salon = new Salon({
            name, city, address, email, phone,
            password: hashedPassword,
            desc, logo, salonType, isMobile, lat, lng,
            status: 'pending_approval',
            isActive: false
        });
        await salon.save();

        // ===== إرسال إشعار إلى Admin =====
        try {
            const notification = new Notification({
                userId: 'admin',
                userType: 'admin',
                title: '📌 طلب صالون جديد',
                message: `صالون "${name}" ينتظر الموافقة. البريد: ${email}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            const io = req.app.get('io');
            if (io) {
                io.to('admin-room').emit('new-notification', {
                    title: '📌 طلب صالون جديد',
                    message: `صالون "${name}" ينتظر الموافقة`
                });
            }

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: 'stevenhacen@gmail.com',
                subject: `📌 طلب صالون جديد: ${name}`,
                html: `
                    <h3>طلب صالون جديد ينتظر الموافقة</h3>
                    <p><strong>الاسم:</strong> ${name}</p>
                    <p><strong>البريد:</strong> ${email}</p>
                    <p><strong>الهاتف:</strong> ${phone}</p>
                    <p><strong>المدينة:</strong> ${city}</p>
                    <p><strong>العنوان:</strong> ${address}</p>
                    <p>قم بتسجيل الدخول إلى لوحة Admin للموافقة أو الرفض.</p>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log('📧 تم إرسال بريد إلى Admin');

        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
        }

        res.status(201).json({
            message: '✅ تم تسجيل الصالون بنجاح! سيتم مراجعته من قبل الإدارة قريباً.',
            salonId: salon._id,
            status: 'pending_approval'
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'فشل التسجيل' });
    }
});

// ✅ تسجيل الدخول (صالون) - مع التحقق من الموافقة
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const salon = await Salon.findOne({ email });
        if (!salon) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        
        // ✅ التحقق من أن الصالون مفعل (تمت الموافقة عليه)
        if (salon.status !== 'active' || salon.isActive !== true) {
            return res.status(403).json({ 
                message: '⏳ حسابك قيد المراجعة. يرجى الانتظار حتى الموافقة عليه من قبل الإدارة.' 
            });
        }
        
        const valid = await bcrypt.compare(password, salon.password);
        if (!valid) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });
        
        const token = jwt.sign({ id: salon._id }, process.env.JWT_SECRET || 'salon_secret_key', { expiresIn: '7d' });
        res.json({ token, salonId: salon._id, name: salon.name });
    } catch (err) {
        console.error('❌ فشل تسجيل الدخول:', err);
        res.status(500).json({ message: 'فشل تسجيل الدخول' });
    }
});

// ✅ تغيير كلمة المرور (صالون)
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
// مسارات Google Login
// ============================================================

// ✅ بدء عملية تسجيل الدخول بـ Google
app.get('/api/auth/google',
    passport.authenticate('google', { 
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })
);

// ✅ رد Google بعد المصادقة
app.get('/api/auth/google/callback',
    passport.authenticate('google', { 
        failureRedirect: '/login-failed',
        session: true
    }),
    (req, res) => {
        // ✅ نجاح تسجيل الدخول - إنشاء JWT وإعادة التوجيه
        const token = jwt.sign(
            { id: req.user._id }, 
            process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key', 
            { expiresIn: '7d' }
        );
        
        const name = encodeURIComponent(req.user.name);
        
        // ✅ إعادة التوجيه إلى الواجهة الأمامية مع التوكن
        res.redirect(
            `https://hilakatidz.vercel.app/?googleLogin=true&token=${token}&customerId=${req.user._id}&name=${name}`
        );
    }
);

// ✅ مسار فشل تسجيل الدخول
app.get('/login-failed', (req, res) => {
    res.redirect('https://hilakatidz.vercel.app/?googleLogin=failed');
});

// ============================================================
// Admin: جلب الصالونات المعلقة
// ============================================================
app.get('/api/admin/pending-salons', adminAuthMiddleware, async (req, res) => {
    try {
        const salons = await Salon.find({ status: 'pending_approval' }).select('-password');
        res.json(salons);
    } catch (error) {
        console.error('❌ فشل جلب الصالونات المعلقة:', error);
        res.status(500).json({ message: 'فشل جلب الصالونات المعلقة' });
    }
});

// ============================================================
// Admin: الموافقة على صالون (تفعيله)
// ============================================================
app.put('/api/admin/approve-salon/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findById(req.params.id);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });

        // ✅ تحديث الحالة إلى active
        salon.status = 'active';
        salon.isActive = true;
        await salon.save();

// إشعار لصاحب الصالون (إذا كان مسجلاً)
try {
    const notification = new Notification({
        userId: salon._id,
        userType: 'salon',
        title: '✅ تم تفعيل صالونك',
        message: `تم قبول طلب تسجيل صالون "${salon.name}". يمكنك الآن البدء في استقبال الحجوزات!`,
        read: false,
        createdAt: new Date() // ✅ أضف هذا السطر
    });
    await notification.save();
} catch (e) {}

        res.json({ message: '✅ تم تفعيل الصالون بنجاح' });
    } catch (error) {
        console.error('❌ فشل التفعيل:', error);
        res.status(500).json({ message: 'فشل التفعيل' });
    }
});

// ============================================================
// Admin: رفض صالون (حذفه)
// ============================================================
app.delete('/api/admin/reject-salon/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findById(req.params.id);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });

        // ✅ حذف الصالون
        await salon.deleteOne();
        res.json({ message: '✅ تم رفض وحذف الصالون' });
    } catch (error) {
        console.error('❌ فشل الحذف:', error);
        res.status(500).json({ message: 'فشل الحذف' });
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

// ============================================================
// إرسال إشعار جماعي مع اختيار نوع المستخدم
// ============================================================
app.post('/api/admin/broadcast', adminAuthMiddleware, async (req, res) => {
    try {
        const { title, message, userType } = req.body;
        
        if (!title || !message) {
            return res.status(400).json({ message: 'العنوان والنص مطلوبان' });
        }

        let users = [];
        let targetUsers = [];

        if (userType === 'all' || userType === 'salon') {
            const salons = await Salon.find().select('_id');
            salons.forEach(salon => {
                users.push({ userId: salon._id, userType: 'salon' });
            });
            targetUsers.push('الصالونات');
        }

        if (userType === 'all' || userType === 'customer') {
            const customers = await Customer.find().select('_id');
            customers.forEach(customer => {
                users.push({ userId: customer._id, userType: 'customer' });
            });
            targetUsers.push('العملاء');
        }

        if (users.length === 0) {
            return res.status(400).json({ message: 'لا يوجد مستخدمون من هذا النوع' });
        }

        // ✅ إنشاء الإشعارات مع createdAt (هذا هو المهم)
        const notifications = users.map(user => ({
            userId: user.userId,
            userType: user.userType,
            title: title,
            message: message,
            read: false,
            createdAt: new Date()  // ⚠️ هذا السطر هو الحل
        }));

        await Notification.insertMany(notifications);

        // ✅ إرسال إشعار فوري عبر Socket.io
        const io = req.app.get('io');
        if (io) {
            if (userType === 'all' || userType === 'salon') {
                const salons = await Salon.find().select('_id');
                salons.forEach(salon => {
                    io.to(`salon-${salon._id}`).emit('new-notification', { title, message });
                });
            }
            if (userType === 'all' || userType === 'customer') {
                const customers = await Customer.find().select('_id');
                customers.forEach(customer => {
                    io.to(`customer-${customer._id}`).emit('new-notification', { title, message });
                });
            }
        }

        res.json({ 
            message: `✅ تم إرسال الإشعار إلى ${notifications.length} مستخدم (${targetUsers.join(' + ')})`,
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
// الصالونات العامة (مع فلترة الصالونات النشطة فقط)
// ============================================================
// ✅ جلب اللوغو (فقط إذا كان الصالون نشطاً)
app.get('/api/salons/:id/logo', async (req, res) => {
    try {
        const salon = await Salon.findOne({ 
            _id: req.params.id, 
            isActive: { $ne: false } 
        }).select('logo');
        
        if (!salon || !salon.logo) {
            return res.status(404).json({ message: 'Logo غير موجود أو صالون معطل' });
        }
        
        const base64Data = salon.logo.replace(/^data:image\/\w+;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        res.set('Content-Type', 'image/png');
        res.send(imgBuffer);
    } catch (error) {
        console.error('❌ خطأ في جلب اللوغو:', error);
        res.status(500).json({ message: error.message });
    }
});

// ✅ جلب الصالونات النشطة فقط (status = 'active')
app.get('/api/salons', async (req, res) => {
    try {
        const salons = await Salon.find({ status: 'active', isActive: true })
            .select('-password -logo -gallery');
        res.json(salons);
    } catch (error) {
        console.error('❌ فشل جلب الصالونات:', error);
        res.status(500).json({ message: error.message });
    }
});

// ✅ جلب صالون واحد (فقط إذا كان نشطاً)
app.get('/api/salons/:id', async (req, res) => {
    try {
        const salon = await Salon.findOne({
            _id: req.params.id,
            status: 'active',
            isActive: true
        }).select('-password -logo -gallery');

        if (!salon) {
            return res.status(404).json({ message: 'الصالون غير موجود أو غير مفعل' });
        }
        res.json(salon);
    } catch (error) {
        console.error('❌ فشل جلب الصالون:', error);
        res.status(500).json({ message: error.message });
    }
});

app.put('/api/salons/:id/services', authMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findByIdAndUpdate(
            req.params.id, 
            { services: req.body.services }, 
            { new: true }
        );
        res.json(salon);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.put('/api/salons/:id/staff', authMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findByIdAndUpdate(
            req.params.id, 
            { staff: req.body.staff }, 
            { new: true }
        );
        res.json(salon);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.put('/api/salons/:id/hours', authMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findByIdAndUpdate(
            req.params.id, 
            { hours: req.body.hours }, 
            { new: true }
        );
        res.json(salon);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.put('/api/salons/:id/settings', authMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true }
        );
        res.json(salon);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete('/api/salons/me', authMiddleware, async (req, res) => {
    try {
        await Salon.findByIdAndDelete(req.userId);
        res.json({ message: 'تم حذف الصالون' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// الحجوزات
// ============================================================

// جلب الحجوزات (صالون)
app.get('/api/appointments', authMiddleware, async (req, res) => {
    const appointments = await Appointment.find({ salonId: req.userId });
    res.json(appointments);
});

// جلب حجوزاتي (عميل)
app.get('/api/appointments/my', customerAuthMiddleware, async (req, res) => {
    const appointments = await Appointment.find({ customerId: req.customerId }).populate('salonId', 'name');
    res.json(appointments);
});

// جلب حجوزات برقم الهاتف
app.get('/api/appointments/client/:phone', async (req, res) => {
    const appointments = await Appointment.find({ clientPhone: req.params.phone }).populate('salonId', 'name');
    res.json(appointments);
});

// ============================================================
// إنشاء حجز جديد (مع اسم الصالون في الإشعار)
// ============================================================
app.post('/api/appointments/request', async (req, res) => {
    try {
        const { salonId, customerId, clientName, clientPhone, clientEmail, services, totalPrice, staff, date, time, payment, notes, recurring } = req.body;

        // 1. التحقق من الصالون
        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: '❌ الصالون غير موجود' });
        }
        if (salon.isActive === false) {
            return res.status(403).json({ 
                message: '❌ هذا الصالون معطل حالياً. يرجى اختيار صالون آخر.' 
            });
        }

        // 2. التحقق من ساعات العمل
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const selectedDate = new Date(date);
        const dayIndex = selectedDate.getDay();
        const dayName = dayNames[dayIndex];

        let dayHours = null;
        if (salon.hours) {
            if (typeof salon.hours.get === 'function') {
                dayHours = salon.hours.get(dayName);
            } else {
                dayHours = salon.hours[dayName];
            }
        }

        if (!dayHours || dayHours === 'مغلق' || dayHours === 'closed') {
            return res.status(400).json({
                message: `❌ الصالون مغلق يوم ${dayName}`
            });
        }

        const [openTime, closeTime] = dayHours.split('-').map(t => t.trim());
        const [openHour, openMinute] = openTime.split(':').map(Number);
        const [closeHour, closeMinute] = closeTime.split(':').map(Number);
        const [hour, minute] = time.split(':').map(Number);

        const openMinutes = openHour * 60 + openMinute;
        const closeMinutes = closeHour * 60 + closeMinute;
        const bookingMinutes = hour * 60 + minute;

        // منع الحجز قبل الفتح
        if (bookingMinutes < openMinutes) {
            return res.status(400).json({
                message: `❌ وقت الحجز (${time}) قبل فتح الصالون. أوقات العمل من ${openTime} إلى ${closeTime}`
            });
        }

        // منع الحجز في آخر ساعة قبل الإغلاق
        const lastBookingTime = closeMinutes - 60;
        if (bookingMinutes > lastBookingTime) {
            const lastHour = Math.floor(lastBookingTime / 60);
            const lastMinute = lastBookingTime % 60;
            const lastTimeStr = `${String(lastHour).padStart(2, '0')}:${String(lastMinute).padStart(2, '0')}`;
            return res.status(400).json({
                message: `❌ آخر موعد للحجز هو ${lastTimeStr} (قبل الإغلاق بساعة). أوقات العمل من ${openTime} إلى ${closeTime}`
            });
        }

        // 3. التحقق من أن الوقت ليس في الماضي
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        if (date === today) {
            const [hours, minutes] = time.split(':').map(Number);
            const selectedDateTime = new Date();
            selectedDateTime.setHours(hours, minutes, 0, 0);
            const minBookingTime = new Date(now.getTime() + 30 * 60 * 1000);
            if (selectedDateTime < minBookingTime) {
                return res.status(400).json({
                    message: `❌ لا يمكن الحجز في وقت مضى. يجب أن يكون الموعد بعد ${minBookingTime.toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'})} على الأقل`
                });
            }
        }

        // 4. التحقق من عدم وجود حجز مكرر
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

        // 5. إنشاء الحجز
        const appointment = new Appointment({
            salonId, customerId, clientName, clientPhone, clientEmail,
            services, totalPrice, staff, date, time, payment, notes,
            recurring, status: 'pending'
        });
        await appointment.save();

        // 6. إشعار للصالون (مع اسم الصالون)
        try {
            const salonName = salon.name || 'الصالون';
            const notification = new Notification({
                userId: salonId,
                userType: 'salon',
                title: '📅 حجز جديد',
                message: `حجز من ${clientName} في ${date} الساعة ${time} - صالون ${salonName}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();
            const io = req.app.get('io');
            if (io) {
                io.to(`salon-${salonId}`).emit('new-notification', {
                    title: '📅 حجز جديد',
                    message: `حجز من ${clientName} في ${date} الساعة ${time} - صالون ${salonName}`
                });
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
// تأكيد الحجز (مع اسم الصالون في الإشعار)
// ============================================================
app.put('/api/appointments/:id/confirm', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        appointment.status = 'confirmed';
        await appointment.save();

        // ===== إشعار للعميل بتأكيد الحجز (مع اسم الصالون) =====
        if (appointment.customerId) {
            try {
                const salon = await Salon.findById(appointment.salonId).select('name');
                const salonName = salon ? salon.name : 'الصالون';
                
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '✅ تم تأكيد حجزك',
                    message: `تم تأكيد حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}`,
                    read: false,
                    createdAt: new Date()
                });
                await notification.save();
                console.log(`✅ تم إرسال إشعار تأكيد للعميل ${appointment.customerId} - صالون ${salonName}`);
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
// إلغاء الحجز (مع اسم الصالون في الإشعار)
// ============================================================
app.put('/api/appointments/:id/cancel', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        
        if (appointment.salonId.toString() !== req.userId) {
            return res.status(403).json({ message: '❌ غير مصرح لك بإلغاء هذا الحجز' });
        }
        
        appointment.status = 'cancelled';
        await appointment.save();

        // ===== إشعار للعميل بإلغاء الحجز (مع اسم الصالون) =====
        if (appointment.customerId) {
            try {
                const salon = await Salon.findById(appointment.salonId).select('name');
                const salonName = salon ? salon.name : 'الصالون';
                
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '❌ تم إلغاء حجزك',
                    message: `تم إلغاء حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}`,
                    read: false,
                    createdAt: new Date()
                });
                await notification.save();
                console.log(`✅ تم إرسال إشعار إلغاء للعميل ${appointment.customerId} - صالون ${salonName}`);
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
// إكمال الحجز (مع اسم الصالون في الإشعار)
// ============================================================
app.put('/api/appointments/:id/complete', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        appointment.status = 'completed';
        await appointment.save();

        // ===== إشعار للعميل بإكمال الحجز (مع اسم الصالون) =====
        if (appointment.customerId) {
            try {
                const salon = await Salon.findById(appointment.salonId).select('name');
                const salonName = salon ? salon.name : 'الصالون';
                
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '✅ تم إكمال حجزك',
                    message: `تم إكمال حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}. نشكرك على زيارتنا! 💈`,
                    read: false,
                    createdAt: new Date()
                });
                await notification.save();
                console.log(`✅ تم إرسال إشعار إكمال للعميل ${appointment.customerId} - صالون ${salonName}`);
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
// إكمال الحجز مع تقييم (مع إشعار للعميل يحوي اسم الصالون)
// ============================================================
app.put('/api/appointments/:id/complete-with-review', customerAuthMiddleware, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const appointmentId = req.params.id;
        
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }

        if (appointment.customerId.toString() !== req.customerId) {
            return res.status(403).json({ message: '❌ هذا الحجز ليس لك' });
        }

        if (!['confirmed', 'completed'].includes(appointment.status)) {
            return res.status(400).json({ 
                message: '❌ لا يمكن تقييم حجز غير مؤكد أو مكتمل' 
            });
        }

        const existingReview = await Review.findOne({
            salonId: appointment.salonId,
            customerId: req.customerId
        });
        if (existingReview) {
            return res.status(409).json({
                message: '❌ لقد قمت بتقييم هذا الصالون مسبقاً'
            });
        }

        appointment.status = 'completed';
        await appointment.save();

        // ===== جلب اسم الصالون للإشعارات =====
        const salon = await Salon.findById(appointment.salonId).select('name');
        const salonName = salon ? salon.name : 'الصالون';

        let review = null;
        if (rating && rating > 0) {
            const customer = await Customer.findById(req.customerId);
            review = new Review({
                salonId: appointment.salonId,
                customerId: req.customerId,
                customerName: customer.name,
                rating: Math.min(5, Math.max(1, rating)),
                comment: comment || '',
                date: new Date().toISOString().split('T')[0]
            });
            await review.save();

            const reviews = await Review.find({ salonId: appointment.salonId });
            const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
            await Salon.findByIdAndUpdate(appointment.salonId, {
                rating: Math.round(avg * 10) / 10,
                totalReviews: reviews.length
            });
        }

        // ===== إشعار للصالون =====
        try {
            const notification = new Notification({
                userId: appointment.salonId,
                userType: 'salon',
                title: '✅ تم إكمال حجز',
                message: `تم إكمال حجز ${appointment.clientName}${review ? ' مع تقييم ⭐' : ''}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();
        } catch (notifError) {
            console.error('❌ فشل إرسال إشعار الصالون:', notifError);
        }

        // ===== ✅ إشعار للعميل مع اسم الصالون =====
        try {
            const customerNotification = new Notification({
                userId: appointment.customerId,
                userType: 'customer',
                title: '✅ تم إكمال حجزك',
                message: `تم إكمال حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}. نشكرك على زيارتنا! 💈`,
                read: false,
                createdAt: new Date()
            });
            await customerNotification.save();
            console.log(`✅ تم إرسال إشعار إكمال للعميل ${appointment.customerId} - صالون ${salonName}`);
        } catch (notifError) {
            console.error('❌ فشل إرسال إشعار العميل:', notifError);
        }

        res.status(200).json({
            message: review ? '✅ تم إكمال الحجز وإضافة التقييم' : '✅ تم إكمال الحجز',
            appointment,
            review
        });

    } catch (error) {
        console.error('❌ فشل إكمال الحجز مع التقييم:', error);
        res.status(500).json({ message: '❌ فشل إكمال الحجز مع التقييم' });
    }
});

// ============================================================
// التقييمات
// ============================================================

// ✅ جلب تقييمات صالون معين
app.get('/api/reviews/salon/:salonId', async (req, res) => {
    try {
        const reviews = await Review.find({ salonId: req.params.salonId })
            .sort({ createdAt: -1 });
        res.json(reviews);
    } catch (error) {
        console.error('❌ فشل جلب تقييمات الصالون:', error);
        res.status(500).json({ message: '❌ فشل جلب التقييمات' });
    }
});

// ✅ جلب تقييم واحد
app.get('/api/reviews/:id', async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ message: '❌ التقييم غير موجود' });
        }
        res.json(review);
    } catch (error) {
        console.error('❌ فشل جلب التقييم:', error);
        res.status(500).json({ message: '❌ فشل جلب التقييم' });
    }
});

// ✅ إضافة تقييم جديد
app.post('/api/reviews', customerAuthMiddleware, async (req, res) => {
    try {
        const { salonId, rating, comment } = req.body;
        
        const customer = await Customer.findById(req.customerId);
        if (!customer) {
            return res.status(404).json({ message: '❌ عميل غير موجود' });
        }

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

        const existingReview = await Review.findOne({
            salonId: salonId,
            customerId: req.customerId
        });

        if (existingReview) {
            return res.status(409).json({
                message: '❌ لقد قمت بتقييم هذا الصالون مسبقاً'
            });
        }

        const review = new Review({
            salonId,
            customerId: req.customerId,
            customerName: customer.name,
            rating,
            comment,
            date: new Date().toISOString().split('T')[0]
        });
        await review.save();

        const reviews = await Review.find({ salonId });
        const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
        await Salon.findByIdAndUpdate(salonId, {
            rating: Math.round(avg * 10) / 10,
            totalReviews: reviews.length
        });

        res.status(201).json({
            message: '✅ تم إضافة التقييم بنجاح',
            review: review
        });

    } catch (err) {
        console.error('❌ فشل إضافة التقييم:', err);
        res.status(500).json({ message: '❌ فشل إضافة التقييم' });
    }
});

// ✅ حذف تقييم (للمدير)
app.delete('/api/reviews/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const review = await Review.findByIdAndDelete(req.params.id);
        if (!review) {
            return res.status(404).json({ message: '❌ التقييم غير موجود' });
        }
        res.json({ message: '✅ تم حذف التقييم' });
    } catch (error) {
        console.error('❌ فشل حذف التقييم:', error);
        res.status(500).json({ message: '❌ فشل حذف التقييم' });
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

// ✅ جلب إشعارات الصالون (مع Pagination)
app.get('/api/notifications/salon', authMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const skip = parseInt(req.query.skip) || 0;
        
        const notifications = await Notification.find({ 
            userId: req.userId, 
            userType: 'salon' 
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);
        
        const total = await Notification.countDocuments({ 
            userId: req.userId, 
            userType: 'salon' 
        });

        console.log(`📦 إشعارات الصالون: ${notifications.length} من ${total}`);
        res.json({ 
            notifications, 
            total,
            hasMore: (skip + limit) < total 
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إشعارات الصالون:', error);
        res.status(500).json({ notifications: [], total: 0, hasMore: false });
    }
});

// ✅ جلب إشعارات العميل (مع Pagination)
app.get('/api/notifications/customer', customerAuthMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10; // ✅ 10 إشعارات افتراضياً
        const skip = parseInt(req.query.skip) || 0;
        
        const notifications = await Notification.find({ 
            userId: req.customerId, 
            userType: 'customer' 
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);
        
        const total = await Notification.countDocuments({ 
            userId: req.customerId, 
            userType: 'customer' 
        });

        console.log(`📦 إشعارات العميل: ${notifications.length} من ${total}`);
        res.json({ 
            notifications, 
            total,
            hasMore: (skip + limit) < total 
        });
    } catch (error) {
        console.error('❌ خطأ في جلب إشعارات العميل:', error);
        res.status(500).json({ notifications: [], total: 0, hasMore: false });
    }
});
// ============================================================
// مسح جميع الإشعارات
// ============================================================
app.delete('/api/notifications/clear', async (req, res) => {
    try {
        const { userId, userType } = req.body;
        console.log('🗑️ طلب مسح الإشعارات:', { userId, userType });
        
        if (!userId || !userType) {
            return res.status(400).json({ message: 'بيانات غير مكتملة' });
        }
        
        const result = await Notification.deleteMany({ userId, userType });
        console.log(`✅ تم مسح ${result.deletedCount} إشعار`);
        
        res.json({ 
            message: `✅ تم مسح ${result.deletedCount} إشعار`,
            count: result.deletedCount
        });
    } catch (error) {
        console.error('❌ خطأ في clear notifications:', error);
        res.status(500).json({ message: 'فشل مسح الإشعارات' });
    }
});

// ✅ جلب إشعارات Admin
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

// ✅ تحديد جميع إشعارات الصالون كمقروءة
app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: '❌ غير مصرح' });
        }

        let userId = null;
        // ✅ محاولة فك التوكن كـ صالون
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'salon_secret_key');
            userId = decoded.id;
            console.log('✅ تم التعرف على صالون:', userId);
        } catch (e) {
            // ✅ محاولة فك التوكن كـ عميل
            try {
                const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key');
                userId = decoded.id;
                console.log('✅ تم التعرف على عميل:', userId);
            } catch (e2) {
                console.error('❌ توكن غير صالح:', e2.message);
                return res.status(401).json({ message: '❌ توكن غير صالح' });
            }
        }

        if (!userId) {
            return res.status(401).json({ message: '❌ غير مصرح' });
        }

        const result = await Notification.updateMany(
            { userId, read: false },
            { read: true }
        );
        res.json({ 
            message: `✅ تم تحديد ${result.modifiedCount} إشعار كمقروء`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ فشل تحديث الإشعارات:', error);
        res.status(500).json({ message: '❌ فشل تحديث الإشعارات' });
    }
});

// ✅ تحديد جميع إشعارات العميل كمقروءة
app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: '❌ غير مصرح' });

        let userId = null;
        // محاولة فك التوكن كـ صالون
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'salon_secret_key');
            userId = decoded.id;
        } catch (e) {
            // محاولة فك التوكن كـ عميل
            try {
                const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key');
                userId = decoded.id;
            } catch (e2) {
                return res.status(401).json({ message: '❌ توكن غير صالح' });
            }
        }

        const result = await Notification.updateMany(
            { userId, read: false },
            { read: true }
        );
        res.json({ 
            message: `✅ تم تحديد ${result.modifiedCount} إشعار كمقروء`,
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('❌ فشل تحديث الإشعارات:', error);
        res.status(500).json({ message: '❌ فشل تحديث الإشعارات' });
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

// ============================================================
// مسار الاتصال (نموذج اتصل بنا)
// ============================================================
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        
        if (!name || !email || !message) {
            return res.status(400).json({ message: 'جميع الحقول مطلوبة' });
        }

        console.log('📩 رسالة جديدة:', { name, email, message });

        // محاولة إرسال البريد الإلكتروني
        try {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: 'stevenhacen@gmail.com',
                subject: `📩 رسالة جديدة من ${name} عبر موقع حلاقتي`,
                html: `
                    <div dir="rtl">
                        <h2>📩 رسالة جديدة من موقع حلاقتي</h2>
                        <p><strong>👤 الاسم:</strong> ${name}</p>
                        <p><strong>📧 البريد:</strong> ${email}</p>
                        <p><strong>📝 الرسالة:</strong></p>
                        <p>${message}</p>
                    </div>
                `
            };
            await transporter.sendMail(mailOptions);
            console.log('✅ تم إرسال البريد بنجاح');
        } catch (emailError) {
            console.error('❌ فشل إرسال البريد:', emailError);
        }

        res.json({ message: '✅ تم إرسال رسالتك بنجاح!' });
        
    } catch (error) {
        console.error('❌ فشل إرسال الرسالة:', error);
        res.status(500).json({ message: '❌ فشل إرسال الرسالة' });
    }
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📡 Socket.io جاهز للإشعارات الفورية`);
});
