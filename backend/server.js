require('dotenv').config();
console.log('🔑 JWT_CUSTOMER_SECRET:', process.env.JWT_CUSTOMER_SECRET ? '✅ موجود' : '❌ غير موجود');
console.log('🔑 القيمة:', process.env.JWT_CUSTOMER_SECRET);
console.log(`🔑 إنشاء توكن عميل بالمفتاح: "${process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key'}"`);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const http = require('http');
const socketIo = require('socket.io');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');


const webpush = require('web-push');

// ✅ ضع مفتاحك الخاص هنا (من `npx web-push generate-vapid-keys`)
const VAPID_PUBLIC_KEY = 'BAu-M60w7YjQLUY-YiE1_QecxnHzbwPK7m8ooNQ-pBdw-AUs1_ZTqiTUKG4sLj9HkUqqSb-5RNNQKlUGZhtxmr0';  // 🔑 مفتاحك العام
const VAPID_PRIVATE_KEY = '3_FMskqQpmMQ2-QpDZWRm1eY_sAO0NcU9Hi-2OqCY_s';  // 🔑 مفتاحك الخاص

webpush.setVapidDetails(
    'mailto:stevenhacen@gmail.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

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

// إرسال Ping كل 60 ثانية لإبقاء الخادم نشطاً (لـ WebSocket)
setInterval(() => {
    io.emit('ping', { timestamp: Date.now() });
}, 60000);

// ============================================================
// Middleware
// ============================================================
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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
app.use(session({
    secret: process.env.SESSION_SECRET || 'session_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: 'https://halakati-project.onrender.com/api/auth/google/callback',
    passReqToCallback: true
}, async (req, accessToken, refreshToken, profile, done) => {
    try {
        console.log('🔍 Google Profile:', profile);

        let customer = await Customer.findOne({ email: profile.emails[0].value });

        if (customer) {
            if (!customer.googleId) {
                customer.googleId = profile.id;
                customer.avatar = profile.photos?.[0]?.value || '';
                await customer.save();
            }
            return done(null, customer);
        }

        customer = new Customer({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            avatar: profile.photos?.[0]?.value || '',
            isVerified: true,
            password: null
        });
        await customer.save();

        return done(null, customer);
    } catch (err) {
        console.error('❌ Google Strategy Error:', err);
        return done(err, null);
    }
}));

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
const Coupon = require('./models/Coupon');
const Quote = require('./models/Quote');

// ============================================================
// ✅ Web Push Notifications - تخزين الاشتراكات
// ============================================================
let pushSubscriptions = [];

// ============================================================
// ✅ دالة إرسال Push Notification
// ============================================================
async function sendPushNotification(userId, userType, title, message) {
    try {
        const subscriptions = pushSubscriptions.filter(
            sub => sub.userId === userId && sub.userType === userType
        );

        if (subscriptions.length === 0) {
            console.log(`ℹ️ لا يوجد اشتراكات Push للمستخدم ${userId} (${userType})`);
            return;
        }

        console.log(`📤 إرسال Push إلى ${subscriptions.length} جهاز للمستخدم ${userId}`);

        const payload = JSON.stringify({
            title: title,
            body: message,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-72.png',
            data: {
                url: '/',
                notificationId: Date.now()
            }
        });

        for (const sub of subscriptions) {
            try {
                const result = await webpush.sendNotification(
                    sub.subscription,
                    payload
                );
                console.log(`✅ تم إرسال Push للمستخدم ${userId}: ${result.statusCode}`);
            } catch (err) {
                if (err.statusCode === 410) {
                    pushSubscriptions = pushSubscriptions.filter(s => s.endpoint !== sub.endpoint);
                    console.warn(`⚠️ اشتراك منتهي، تم حذفه: ${sub.endpoint}`);
                } else {
                    console.error(`❌ فشل إرسال Push للمستخدم ${userId}:`, err.message);
                }
            }
        }
    } catch (error) {
        console.error('❌ فشل إرسال الإشعارات:', error);
    }
}

// ============================================================
// ✅ مسارات Push Notifications
// ============================================================

// حفظ الاشتراك
app.post('/api/push/subscribe', async (req, res) => {
    try {
        const { userId, userType, subscription, endpoint } = req.body;

        if (!userId || !userType || !subscription) {
            return res.status(400).json({ message: 'بيانات غير مكتملة' });
        }

        // ✅ التحقق من وجود اشتراك سابق لنفس المستخدم ونفس النقطة
        const existingIndex = pushSubscriptions.findIndex(
            sub => sub.userId === userId && sub.userType === userType && sub.endpoint === endpoint
        );

        if (existingIndex > -1) {
            // تحديث الاشتراك الموجود
            pushSubscriptions[existingIndex] = { userId, userType, subscription, endpoint };
        } else {
            // إضافة اشتراك جديد
            pushSubscriptions.push({ userId, userType, subscription, endpoint });
        }

        console.log(`✅ تم تسجيل اشتراك Push للمستخدم ${userId} (${userType})`);
        console.log(`📊 عدد المشتركين: ${pushSubscriptions.length}`);

        res.json({ message: '✅ تم حفظ الاشتراك' });
    } catch (error) {
        console.error('❌ فشل حفظ الاشتراك:', error);
        res.status(500).json({ message: 'فشل حفظ الاشتراك' });
    }
});

// إلغاء الاشتراك
app.post('/api/push/unsubscribe', async (req, res) => {
    try {
        const { userId, userType } = req.body;

        if (!userId || !userType) {
            return res.status(400).json({ message: 'بيانات غير مكتملة' });
        }

        const beforeCount = pushSubscriptions.length;
        pushSubscriptions = pushSubscriptions.filter(
            sub => !(sub.userId === userId && sub.userType === userType)
        );

        console.log(`✅ تم إلغاء اشتراك Push للمستخدم ${userId} (${userType})`);
        console.log(`📊 عدد المشتركين: ${pushSubscriptions.length} (قبل: ${beforeCount})`);

        res.json({ message: '✅ تم إلغاء الاشتراك' });
    } catch (error) {
        console.error('❌ فشل إلغاء الاشتراك:', error);
        res.status(500).json({ message: 'فشل إلغاء الاشتراك' });
    }
});

// ============================================================
// ✅ دالة مساعدة لمعالجة المنتجات وخصم الكميات
// ============================================================
async function processInventoryItems(inventoryItems, salonId) {
    const deductions = [];
    const notifications = [];

    for (const item of inventoryItems) {
        const quantityNeeded = item.consumptionPerBooking;

        console.log(`🔍 المنتج: ${item.name}, الخدمة المرتبطة: ${item.serviceName || item.serviceId}, المطلوب: ${quantityNeeded}, الموجود: ${item.quantity}`);

        if (item.quantity < quantityNeeded) {
            console.warn(`⚠️ المخزون غير كافٍ للمنتج "${item.name}"`);
            notifications.push({
                title: '⚠️ مخزون غير كافٍ',
                message: `المنتج "${item.name}" غير كافٍ لتلبية الحجز (المتبقي ${item.quantity}، المطلوب ${quantityNeeded})`
            });
            continue;
        }

        item.quantity -= quantityNeeded;
        item.totalConsumed = (item.totalConsumed || 0) + quantityNeeded;
        await item.save();

        deductions.push({
            productId: item._id,
            productName: item.name,
            quantityDeducted: quantityNeeded,
            remaining: item.quantity,
            unit: item.unit
        });

        if (item.quantity <= item.minQuantity) {
            notifications.push({
                title: '⚠️ مخزون منخفض',
                message: `المنتج "${item.name}" أصبح منخفضاً (${item.quantity} ${item.unit} متبقية)`
            });
        }
    }

    for (const notif of notifications) {
        await createNotification(salonId, 'salon', notif.title, notif.message);
    }

    console.log(`✅ تم خصم ${deductions.length} منتج من المخزون`);
    return deductions;
}

// ============================================================
// ✅ خصم المخزون عند إكمال الحجز
// ============================================================
async function deductInventoryForBooking(appointmentId) {
    try {
        const Inventory = require('./models/Inventory');
        const Appointment = require('./models/Appointment');
        const mongoose = require('mongoose');

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            console.error('❌ الحجز غير موجود');
            return [];
        }

        const salonId = appointment.salonId;
        const services = appointment.services || [];

        if (services.length === 0) {
            console.log('ℹ️ لا توجد خدمات في الحجز');
            return [];
        }

        const serviceIds = [];
        for (const service of services) {
            let id = null;
            if (service._id) id = service._id;
            else if (service.id) id = service.id;
            else if (service.serviceId) id = service.serviceId;

            if (id) {
                serviceIds.push(id.toString());
            }
        }

        console.log(`📋 معرفات الخدمات في الحجز: ${serviceIds.join(', ')}`);

        if (serviceIds.length === 0) {
            console.log('ℹ️ لا توجد معرفات خدمات صالحة');
            return [];
        }

        let inventoryItems = await Inventory.find({
            salonId: salonId,
            isActive: true,
            consumptionPerBooking: { $gt: 0 },
            serviceId: { $in: serviceIds }
        });

        if (inventoryItems.length === 0) {
            const objectIds = serviceIds
                .map(id => {
                    try { return new mongoose.Types.ObjectId(id); }
                    catch { return null; }
                })
                .filter(id => id !== null);

            if (objectIds.length > 0) {
                inventoryItems = await Inventory.find({
                    salonId: salonId,
                    isActive: true,
                    consumptionPerBooking: { $gt: 0 },
                    serviceId: { $in: objectIds }
                });
            }
        }

        console.log(`📦 عدد المنتجات المرتبطة: ${inventoryItems.length}`);

        if (inventoryItems.length === 0) {
            console.log('ℹ️ لا توجد منتجات مرتبطة بهذه الخدمات');
            return [];
        }

        const deductions = [];
        const notifications = [];

        for (const item of inventoryItems) {
            const quantityNeeded = item.consumptionPerBooking;

            console.log(`🔍 المنتج: ${item.name}, الخدمة المرتبطة: ${item.serviceId}, المطلوب: ${quantityNeeded}, الموجود: ${item.quantity}`);

            if (item.quantity < quantityNeeded) {
                console.warn(`⚠️ المخزون غير كافٍ للمنتج "${item.name}"`);
                notifications.push({
                    title: '⚠️ مخزون غير كافٍ',
                    message: `المنتج "${item.name}" غير كافٍ (المتبقي ${item.quantity})`
                });
                continue;
            }

            item.quantity -= quantityNeeded;
            item.totalConsumed = (item.totalConsumed || 0) + quantityNeeded;
            await item.save();

            deductions.push({
                productId: item._id,
                productName: item.name,
                quantityDeducted: quantityNeeded,
                remaining: item.quantity,
                unit: item.unit
            });

            if (item.quantity <= item.minQuantity) {
                notifications.push({
                    title: '⚠️ مخزون منخفض',
                    message: `المنتج "${item.name}" أصبح منخفضاً (${item.quantity} ${item.unit})`
                });
            }
        }

        for (const notif of notifications) {
            await createNotification(salonId, 'salon', notif.title, notif.message);
        }

        console.log(`✅ تم خصم ${deductions.length} منتج من المخزون`);
        return deductions;

    } catch (error) {
        console.error('❌ فشل خصم المخزون:', error);
        return [];
    }
}

// ============================================================
// ✅ استعادة المخزون عند إلغاء الحجز
// ============================================================
async function restoreInventoryForBooking(appointmentId) {
    try {
        const Inventory = require('./models/Inventory');
        const Appointment = require('./models/Appointment');
        const mongoose = require('mongoose');

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) return;

        const services = appointment.services || [];
        if (services.length === 0) return;

        const serviceIds = [];
        for (const service of services) {
            let id = null;
            if (service._id) id = service._id;
            else if (service.id) id = service.id;
            else if (service.serviceId) id = service.serviceId;

            if (id) serviceIds.push(id.toString());
        }

        if (serviceIds.length === 0) return;

        let inventoryItems = await Inventory.find({
            salonId: appointment.salonId,
            isActive: true,
            consumptionPerBooking: { $gt: 0 },
            serviceId: { $in: serviceIds }
        });

        if (inventoryItems.length === 0) {
            const objectIds = serviceIds
                .map(id => {
                    try { return new mongoose.Types.ObjectId(id); }
                    catch { return null; }
                })
                .filter(id => id !== null);

            if (objectIds.length > 0) {
                inventoryItems = await Inventory.find({
                    salonId: appointment.salonId,
                    isActive: true,
                    consumptionPerBooking: { $gt: 0 },
                    serviceId: { $in: objectIds }
                });
            }
        }

        if (inventoryItems.length === 0) {
            console.log('ℹ️ لا توجد منتجات لاستعادتها');
            return;
        }

        for (const item of inventoryItems) {
            const quantityToRestore = item.consumptionPerBooking;
            item.quantity += quantityToRestore;
            item.totalConsumed = Math.max(0, (item.totalConsumed || 0) - quantityToRestore);
            await item.save();
        }

        console.log(`✅ تم استعادة المخزون للحجز ${appointmentId} (${inventoryItems.length} منتج)`);

    } catch (error) {
        console.error('❌ فشل استعادة المخزون:', error);
    }
}

// ============================================================
// ✅ دالة مساعدة لإنشاء إشعار (مع Push)
// ============================================================
async function createNotification(userId, userType, title, message) {
    try {
        const Notification = require('./models/Notification');
        const notification = new Notification({
            userId,
            userType,
            title,
            message,
            read: false,
            createdAt: new Date()
        });
        await notification.save();

        // ✅ إرسال Push Notification
        await sendPushNotification(userId, userType, title, message);

    } catch (error) {
        console.error('❌ فشل إنشاء الإشعار:', error);
    }
}

// ============================================================
// ✅ التحقق من صلاحية الكوبون (مسار عام)
// ============================================================
app.post('/api/coupons/validate', async (req, res) => {
    try {
        const { code, salonId, total } = req.body;

        console.log(`🔍 التحقق من الكوبون: ${code} للصالون ${salonId}`);

        if (!code || !salonId) {
            return res.status(400).json({
                valid: false,
                message: '❌ كود الكوبون ومعرف الصالون مطلوبان'
            });
        }

        const coupon = await Coupon.findOne({
            code: code.toUpperCase().trim(),
            salonId,
            isActive: true
        });

        if (!coupon) {
            return res.status(404).json({
                valid: false,
                message: '❌ كوبون غير صالح أو غير موجود'
            });
        }

        console.log(`✅ تم العثور على الكوبون: ${coupon.code}`);

        const now = new Date();
        const validFrom = new Date(coupon.validFrom);
        const validUntil = new Date(coupon.validUntil);

        if (now < validFrom || now > validUntil) {
            return res.status(400).json({
                valid: false,
                message: '❌ انتهت صلاحية الكوبون'
            });
        }

        if (coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({
                valid: false,
                message: '❌ تم استخدام الكوبون بالكامل'
            });
        }

        if (total < coupon.minOrder) {
            return res.status(400).json({
                valid: false,
                message: `❌ الحد الأدنى للطلب هو ${coupon.minOrder} دج`
            });
        }

        let discount = 0;
        if (coupon.type === 'percentage') {
            discount = (total * coupon.value) / 100;
            if (coupon.maxDiscount > 0) {
                discount = Math.min(discount, coupon.maxDiscount);
            }
        } else {
            discount = coupon.value;
        }

        discount = Math.round(discount);
        const newTotal = Math.max(0, total - discount);

        console.log(`💰 الخصم: ${discount} دج، السعر الجديد: ${newTotal} دج`);

        res.json({
            valid: true,
            coupon: {
                _id: coupon._id,
                code: coupon.code,
                type: coupon.type,
                value: coupon.value,
                minOrder: coupon.minOrder,
                maxDiscount: coupon.maxDiscount
            },
            discount: discount,
            newTotal: newTotal
        });

    } catch (error) {
        console.error('❌ فشل التحقق من الكوبون:', error);
        res.status(500).json({
            valid: false,
            message: '❌ فشل التحقق من الكوبون: ' + error.message
        });
    }
});

// دالة ترجمة نوع الخدمة
function translateServiceType(type) {
    const map = {
        'bridal': '💄 مكياج عروس',
        'hair': '💇‍♀️ تسريحة عروس',
        'full': '👰 حزمة كاملة (مكياج + تسريحة)',
        'bridal_party': '👩‍👧‍👧 مكياج للعروس والضيوف',
        'groom': '💈 حلاقة عريس',
        'other': '📌 خدمات أخرى'
    };
    return map[type] || type;
}

// ============================================================
// ✅ مسار عام لتقديم طلب عرض سعر (لا يحتاج مصادقة)
// ============================================================
app.post('/api/quotes/request', async (req, res) => {
    try {
        const {
            salonId,
            customerId,
            customerName,
            customerEmail,
            customerPhone,
            eventDate,
            budget,
            guests,
            serviceType,
            description,
            details
        } = req.body;

        console.log('📊 البيانات المستلمة:', {
            salonId,
            customerName,
            budget,
            guests,
            serviceType,
            description: description || details
        });

        if (!salonId || !customerName || !customerEmail || !customerPhone || !eventDate || !serviceType) {
            return res.status(400).json({ message: 'جميع الحقول المطلوبة فارغة' });
        }

        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: 'الصالون غير موجود' });
        }

        function translateServiceType(type) {
            const translations = {
                'bridal': '💄 مكياج عروس',
                'hair': '💇‍♀️ تسريحة عروس',
                'full': '👰 حزمة كاملة (مكياج + تسريحة)',
                'bridal_party': '👩‍👧‍👧 مكياج للعروس والضيوف',
                'groom': '💈 حلاقة عريس',
                'other': '📌 خدمات أخرى'
            };
            return translations[type] || type;
        }

        const Quote = require('./models/Quote');
        const newQuote = new Quote({
            salonId,
            customerId: customerId || null,
            customerName,
            customerEmail,
            customerPhone,
            eventDate,
            budget: budget || 0,
            guests: guests ?? 0,
            serviceType,
            description: description || details || '',
            status: 'pending'
        });

        await newQuote.save();

        // إشعار للصالون + Push
        try {
            const serviceTypeAr = translateServiceType(serviceType);
            const notification = new Notification({
                userId: salonId,
                userType: 'salon',
                title: '📩 طلب عرض سعر جديد',
                message: `طلب جديد من ${customerName} لخدمة "${serviceTypeAr}" في ${eventDate}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification للصالون
            await sendPushNotification(
                salonId,
                'salon',
                '📩 طلب عرض سعر جديد',
                `طلب جديد من ${customerName} لخدمة "${serviceTypeAr}"`
            );

            }

        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
        }

        res.status(201).json({ message: '✅ تم إرسال طلب عرض السعر بنجاح!', quote: newQuote });
    } catch (error) {
        console.error('❌ فشل إنشاء طلب عرض سعر:', error);
        res.status(500).json({ message: '❌ فشل إنشاء الطلب: ' + error.message });
    }
});

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
        console.error('❌ خطأ في التوكن:', err.message);
        return res.status(401).json({ message: '❌ توكن غير صالح' });
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

app.use('/api/staff', authMiddleware, staffRoutes);
app.use('/api/inventory', authMiddleware, inventoryRoutes);
app.use('/api/coupons', authMiddleware, couponRoutes);
app.use('/api/quotes', quoteRoutes);

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

        const salon = new Salon({
            name, city, address, email, phone,
            password: hashedPassword,
            desc, logo, salonType, isMobile, lat, lng,
            status: 'pending_approval',
            isActive: false
        });
        await salon.save();

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

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const salon = await Salon.findOne({ email });
        if (!salon) return res.status(400).json({ message: 'بيانات الدخول غير صحيحة' });

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
        res.status(500).json({ message: 'فشل تسجيل الدخول: ' + err.message });
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
const CUSTOMER_JWT_SECRET = 'another_secret_for_customers';

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

        const token = jwt.sign({ id: customer._id }, CUSTOMER_JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ token, customerId: customer._id, name: customer.name });
    } catch (err) {
        console.error('❌ فشل التسجيل:', err);
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

        const token = jwt.sign({ id: customer._id }, CUSTOMER_JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, customerId: customer._id, name: customer.name });
    } catch (err) {
        console.error('❌ فشل تسجيل الدخول:', err);
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
        const customer = await Customer.findByIdAndUpdate(
            req.customerId,
            { name, email, phone },
            { new: true }
        ).select('-password');
        res.json(customer);
    } catch (err) {
        console.error('❌ فشل تحديث الملف الشخصي:', err);
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
        console.error('❌ فشل تغيير كلمة المرور:', err);
        res.status(500).json({ message: 'فشل تغيير كلمة المرور' });
    }
});

app.delete('/api/customer/auth/me', customerAuthMiddleware, async (req, res) => {
    try {
        await Customer.findByIdAndDelete(req.customerId);
        res.json({ message: 'تم حذف الحساب' });
    } catch (err) {
        console.error('❌ فشل حذف الحساب:', err);
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
        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: '❌ الصالون غير موجود' });
        }
        const result = await Review.deleteMany({ salonId: salonId });
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
app.get('/api/auth/google',
    passport.authenticate('google', {
        scope: ['profile', 'email'],
        prompt: 'select_account'
    })
);

app.get('/api/auth/google/callback',
    passport.authenticate('google', {
        failureRedirect: '/login-failed',
        session: true
    }),
    (req, res) => {
        const token = jwt.sign(
            { id: req.user._id },
            process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key',
            { expiresIn: '7d' }
        );
        const name = encodeURIComponent(req.user.name);
        res.redirect(
            `https://hilakatidz.vercel.app/?googleLogin=true&token=${token}&customerId=${req.user._id}&name=${name}`
        );
    }
);

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

app.put('/api/admin/approve-salon/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findById(req.params.id);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });

        salon.status = 'active';
        salon.isActive = true;
        await salon.save();

        try {
            const notification = new Notification({
                userId: salon._id,
                userType: 'salon',
                title: '✅ تم تفعيل صالونك',
                message: `تم قبول طلب تسجيل صالون "${salon.name}". يمكنك الآن البدء في استقبال الحجوزات!`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification
            await sendPushNotification(
                salon._id,
                'salon',
                '✅ تم تفعيل صالونك',
                `تم قبول طلب تسجيل صالون "${salon.name}". يمكنك الآن البدء في استقبال الحجوزات!`
            );

        } catch (e) { console.error('❌ فشل إشعار التفعيل:', e); }

        res.json({ message: '✅ تم تفعيل الصالون بنجاح' });
    } catch (error) {
        console.error('❌ فشل التفعيل:', error);
        res.status(500).json({ message: 'فشل التفعيل' });
    }
});

app.delete('/api/admin/reject-salon/:id', adminAuthMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findById(req.params.id);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });
        await salon.deleteOne();
        res.json({ message: '✅ تم رفض وحذف الصالون' });
    } catch (error) {
        console.error('❌ فشل الحذف:', error);
        res.status(500).json({ message: 'فشل الحذف' });
    }
});

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

        res.json({
            message: '✅ تم التحقق من البريد، أدخل كلمة المرور الجديدة',
            resetToken: resetToken,
            userType: userType
        });
    } catch (error) {
        console.error('❌ خطأ في forgot-password:', error);
        res.status(500).json({
            message: 'فشل في إنشاء طلب إعادة التعيين',
            error: error.message
        });
    }
});

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
// مسارات المدير الإضافية
// ============================================================
app.get('/api/admin/stats/advanced', adminAuthMiddleware, async (req, res) => {
    try {
        const totalSalons = await Salon.countDocuments();
        const activeSalons = await Salon.countDocuments({ isActive: { $ne: false } });
        const totalCustomers = await Customer.countDocuments();
        const totalAppointments = await Appointment.countDocuments();
        const pendingAppointments = await Appointment.countDocuments({ status: 'pending' });
        const completedAppointments = await Appointment.countDocuments({ status: 'completed' });
        const totalReviews = await Review.countDocuments();
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

app.put('/api/admin/salons/:id/toggle', adminAuthMiddleware, async (req, res) => {
    try {
        const salon = await Salon.findById(req.params.id);
        if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });

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
// إرسال إشعار جماعي مع Push Notifications
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

        const notifications = users.map(user => ({
            userId: user.userId,
            userType: user.userType,
            title: title,
            message: message,
            read: false,
            createdAt: new Date()
        }));

        await Notification.insertMany(notifications);

        // ✅ إرسال Push للجميع
        for (const user of users) {
            try {
                await sendPushNotification(
                    user.userId,
                    user.userType,
                    title,
                    message
                );
            } catch (pushError) {
                console.error(`❌ فشل Push للمستخدم ${user.userId}:`, pushError);
            }
        }

        res.json({
            message: `✅ تم إرسال الإشعار إلى ${notifications.length} مستخدم (${targetUsers.join(' + ')}) مع Push`,
            count: notifications.length
        });

    } catch (error) {
        console.error('❌ خطأ في broadcast:', error);
        res.status(500).json({ message: 'فشل إرسال الإشعارات' });
    }
});

// ============================================================
// الصالونات العامة
// ============================================================
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

app.get('/api/salons/:id', async (req, res) => {
    try {
        const salon = await Salon.findOne({
            _id: req.params.id,
            status: 'active',
            isActive: true
        }).select('-password -logo');

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
        console.error('❌ فشل تحديث الإعدادات:', error);
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

// ============================================================
// إنشاء حجز جديد
// ============================================================
app.post('/api/appointments/request', async (req, res) => {
    try {
        const {
            salonId,
            customerId,
            clientName,
            clientPhone,
            clientEmail,
            services,
            totalPrice,
            staff,
            date,
            time,
            payment,
            notes,
            recurring,
            couponId,
            couponCode,
            discountAmount,
            originalPrice
        } = req.body;

        const salon = await Salon.findById(salonId);
        if (!salon) {
            return res.status(404).json({ message: '❌ الصالون غير موجود' });
        }
        if (salon.isActive === false) {
            return res.status(403).json({
                message: '❌ هذا الصالون معطل حالياً. يرجى اختيار صالون آخر.'
            });
        }

        // التحقق من ساعات العمل
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

        if (bookingMinutes < openMinutes) {
            return res.status(400).json({
                message: `❌ وقت الحجز (${time}) قبل فتح الصالون. أوقات العمل من ${openTime} إلى ${closeTime}`
            });
        }

        const lastBookingTime = closeMinutes - 60;
        if (bookingMinutes > lastBookingTime) {
            const lastHour = Math.floor(lastBookingTime / 60);
            const lastMinute = lastBookingTime % 60;
            const lastTimeStr = `${String(lastHour).padStart(2, '0')}:${String(lastMinute).padStart(2, '0')}`;
            return res.status(400).json({
                message: `❌ آخر موعد للحجز هو ${lastTimeStr} (قبل الإغلاق بساعة). أوقات العمل من ${openTime} إلى ${closeTime}`
            });
        }

        const now = new Date();
        const today = now.toISOString().split('T')[0];
        if (date === today) {
            const [hours, minutes] = time.split(':').map(Number);
            const selectedDateTime = new Date();
            selectedDateTime.setHours(hours, minutes, 0, 0);
            const minBookingTime = new Date(now.getTime() + 30 * 60 * 1000);
            if (selectedDateTime < minBookingTime) {
                return res.status(400).json({
                    message: `❌ لا يمكن الحجز في وقت مضى. يجب أن يكون الموعد بعد ${minBookingTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} على الأقل`
                });
            }
        }

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

        if (couponId) {
            try {
                const coupon = await Coupon.findById(couponId);

                if (coupon) {
                    coupon.usedCount = (coupon.usedCount || 0) + 1;
                    await coupon.save();

                    if (coupon.usedCount >= coupon.usageLimit) {
                        coupon.isActive = false;
                        await coupon.save();
                    }
                }
            } catch (couponError) {
                console.error('❌ فشل تحديث الكوبون:', couponError);
            }
        }

        const appointment = new Appointment({
            salonId,
            customerId,
            clientName,
            clientPhone,
            clientEmail,
            services,
            totalPrice,
            staff,
            date,
            time,
            payment,
            notes,
            recurring,
            status: 'pending',
            couponId: couponId || null,
            couponCode: couponCode || null,
            discountAmount: discountAmount || 0,
            originalPrice: originalPrice || totalPrice
        });
        await appointment.save();

        // إشعار للصالون
        try {
            const salonName = salon.name || 'الصالون';
            const notification = new Notification({
                userId: salonId,
                userType: 'salon',
                title: '📅 حجز جديد',
                message: `حجز من ${clientName} في ${date} الساعة ${time} - صالون ${salonName}${couponCode ? ` 🎫 كوبون: ${couponCode}` : ''}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification للصالون
            await sendPushNotification(
                salonId,
                'salon',
                '📅 حجز جديد',
                `حجز من ${clientName} في ${date} الساعة ${time} - صالون ${salonName}`
            );

        } catch (notifError) {
            console.error('❌ فشل إنشاء الإشعار:', notifError);
        }

        // إشعار للعميل
        if (customerId) {
            try {
                const customerNotification = new Notification({
                    userId: customerId,
                    userType: 'customer',
                    title: '📅 طلب حجز جديد',
                    message: `تم إرسال طلب حجزك في صالون ${salon.name || 'الصالون'} بتاريخ ${date} الساعة ${time}${couponCode ? ` 🎫 كوبون: ${couponCode}` : ''}`,
                    read: false,
                    createdAt: new Date()
                });
                await customerNotification.save();

                // ✅ Push Notification للعميل
                await sendPushNotification(
                    customerId,
                    'customer',
                    '📅 طلب حجز جديد',
                    `تم إرسال طلب حجزك في صالون ${salon.name || 'الصالون'} بتاريخ ${date} الساعة ${time}`
                );

            } catch (notifError) {
                console.error('❌ فشل إشعار العميل:', notifError);
            }
        }

        res.status(201).json({
            message: '✅ تم إرسال طلب الحجز بنجاح!',
            appointment,
            couponUpdated: couponId ? true : false
        });

    } catch (err) {
        console.error('❌ فشل إنشاء الحجز:', err);
        res.status(500).json({ message: '❌ فشل إنشاء الحجز: ' + err.message });
    }
});

// ============================================================
// تأكيد الحجز
// ============================================================
app.put('/api/appointments/:id/confirm', authMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }
        appointment.status = 'confirmed';
        await appointment.save();

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

                await sendPushNotification(
                    appointment.customerId,
                    'customer',
                    '✅ تم تأكيد حجزك',
                    `تم تأكيد حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}`
                );

            } catch (err) {
                console.error('❌ فشل إشعار التأكيد:', err);
            }
        }

        res.json({ message: '✅ تم تأكيد الموعد' });
    } catch (error) {
        console.error('❌ خطأ في تأكيد الموعد:', error);
        res.status(500).json({ message: '❌ فشل تأكيد الموعد' });
    }
});
        // ===== إشعار للعميل =====
        if (appointment.customerId) {
            try {
                const salon = await Salon.findById(appointment.salonId).select('name');
                const salonName = salon ? salon.name : 'الصالون';
                
                // إشعار في قاعدة البيانات
                const notification = new Notification({
                    userId: appointment.customerId,
                    userType: 'customer',
                    title: '✅ تم تأكيد حجزك',
                    message: `تم تأكيد حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}`,
                    read: false,
                    createdAt: new Date()
                });
                await notification.save();

                // ✅ Push Notification للعميل
                await sendPushNotification(
                    appointment.customerId,
                    'customer',
                    '✅ تم تأكيد حجزك',
                    `تم تأكيد حجزك في صالون ${salonName} بتاريخ ${appointment.date} الساعة ${appointment.time}`
                );

                }

            } catch (err) {
                console.error('❌ فشل إشعار التأكيد:', err);
            }
        }

        res.json({ message: '✅ تم تأكيد الموعد' });
    } catch (error) {
        console.error('❌ خطأ في تأكيد الموعد:', error);
        res.status(500).json({ message: '❌ فشل تأكيد الموعد' });
    }
});

// ============================================================
// إلغاء الحجز من قبل العميل
// ============================================================
app.put('/api/appointments/:id/cancel-by-customer', customerAuthMiddleware, async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }

        if (appointment.customerId && appointment.customerId.toString() !== req.customerId) {
            return res.status(403).json({ message: '❌ غير مصرح لك بإلغاء هذا الحجز' });
        }

        if (appointment.status === 'completed' || appointment.status === 'cancelled') {
            return res.status(400).json({ message: '❌ لا يمكن إلغاء حجز مكتمل أو ملغى بالفعل' });
        }

        appointment.status = 'cancelled';
        await appointment.save();

        try {
            const notification = new Notification({
                userId: appointment.salonId,
                userType: 'salon',
                title: '❌ تم إلغاء حجز',
                message: `قام العميل ${appointment.clientName} بإلغاء حجز ${appointment.date} الساعة ${appointment.time}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification للصالون
            await sendPushNotification(
                appointment.salonId,
                'salon',
                '❌ تم إلغاء حجز',
                `قام العميل ${appointment.clientName} بإلغاء حجز ${appointment.date} الساعة ${appointment.time}`
            );

        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
        }

        res.json({ message: '✅ تم إلغاء الحجز بنجاح', appointment });
    } catch (error) {
        console.error('❌ فشل إلغاء الحجز:', error);
        res.status(500).json({ message: 'فشل إلغاء الحجز: ' + error.message });
    }
});

// ============================================================
// تعديل الحجز من قبل العميل
// ============================================================
app.put('/api/appointments/:id/reschedule', customerAuthMiddleware, async (req, res) => {
    try {
        const { date, time } = req.body;
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) {
            return res.status(404).json({ message: '❌ الحجز غير موجود' });
        }

        if (appointment.customerId && appointment.customerId.toString() !== req.customerId) {
            return res.status(403).json({ message: '❌ غير مصرح لك بتعديل هذا الحجز' });
        }

        if (appointment.status === 'completed' || appointment.status === 'cancelled') {
            return res.status(400).json({ message: '❌ لا يمكن تعديل حجز مكتمل أو ملغى' });
        }

        const existing = await Appointment.findOne({
            salonId: appointment.salonId,
            date,
            time,
            status: { $in: ['pending', 'confirmed'] },
            _id: { $ne: appointment._id }
        });
        if (existing) {
            return res.status(409).json({ message: '❌ هذا الموعد محجوز مسبقاً' });
        }

        appointment.date = date;
        appointment.time = time;
        appointment.status = 'pending';
        await appointment.save();

        try {
            const notification = new Notification({
                userId: appointment.salonId,
                userType: 'salon',
                title: '📅 تم تعديل حجز',
                message: `قام العميل ${appointment.clientName} بتعديل الحجز إلى ${date} الساعة ${time}`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification
            await sendPushNotification(
                appointment.salonId,
                'salon',
                '📅 تم تعديل حجز',
                `قام العميل ${appointment.clientName} بتعديل الحجز إلى ${date} الساعة ${time}`
            );

        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
        }

        res.json({ message: '✅ تم تعديل الحجز بنجاح', appointment });
    } catch (error) {
        console.error('❌ فشل تعديل الحجز:', error);
        res.status(500).json({ message: 'فشل تعديل الحجز: ' + error.message });
    }
});

// ============================================================
// إلغاء الحجز (صالون)
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

        // ===== إشعار للعميل =====
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

                // ✅ Push Notification للعميل
                await sendPushNotification(
                    appointment.customerId,
                    'customer',
                    '❌ تم إلغاء حجزك',
                    `تم إلغاء حجزك في صالون ${salonName}`
                );

                }

            } catch (err) {
                console.error('❌ فشل إشعار الإلغاء:', err);
            }
        }

        res.json({ message: '✅ تم إلغاء الموعد' });
    } catch (error) {
        console.error('❌ خطأ في إلغاء الموعد:', error);
        res.status(500).json({ message: '❌ فشل إلغاء الموعد' });
    }
});

// ============================================================
// إكمال الحجز (صالون)
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

                // ✅ Push Notification للعميل
                await sendPushNotification(
                    appointment.customerId,
                    'customer',
                    '✅ تم إكمال حجزك',
                    `تم إكمال حجزك في صالون ${salonName}. نشكرك على زيارتنا! 💈`
                );

            } catch (err) {
                console.error('❌ فشل إشعار الإكمال:', err);
            }
        }

        res.json({ message: '✅ تم إكمال الموعد' });
    } catch (error) {
        console.error('❌ خطأ في إكمال الموعد:', error);
        res.status(500).json({ message: '❌ فشل إكمال الموعد' });
    }
});

// ============================================================
// إكمال الحجز مع تقييم (عميل)
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

            await sendPushNotification(
                appointment.salonId,
                'salon',
                '✅ تم إكمال حجز',
                `تم إكمال حجز ${appointment.clientName}${review ? ' مع تقييم ⭐' : ''}`
            );

        } catch (notifError) {
            console.error('❌ فشل إرسال إشعار الصالون:', notifError);
        }

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

            await sendPushNotification(
                appointment.customerId,
                'customer',
                '✅ تم إكمال حجزك',
                `تم إكمال حجزك في صالون ${salonName}. نشكرك على زيارتنا! 💈`
            );

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

app.post('/api/reviews', customerAuthMiddleware, async (req, res) => {
    try {
        const { salonId, rating, comment, image } = req.body;

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
            image: image || null,
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
    res.json({
        status: 'online',
        message: '🚀 مرحباً بك في API منصة حلاقتي!',
        timestamp: new Date().toISOString(),
    });
});

// ============================================================
// مسارات الإشعارات
// ============================================================
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

app.get('/api/notifications/customer', customerAuthMiddleware, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
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

app.delete('/api/notifications/clear', async (req, res) => {
    try {
        const { userId, userType } = req.body;
        if (!userId || !userType) {
            return res.status(400).json({ message: 'بيانات غير مكتملة' });
        }
        const result = await Notification.deleteMany({ userId, userType });
        res.json({
            message: `✅ تم مسح ${result.deletedCount} إشعار`,
            count: result.deletedCount
        });
    } catch (error) {
        console.error('❌ خطأ في clear notifications:', error);
        res.status(500).json({ message: 'فشل مسح الإشعارات' });
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

app.put('/api/notifications/read-all', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: '❌ غير مصرح' });
        }

        let userId = null;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'salon_secret_key');
            userId = decoded.id;
        } catch (e) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key');
                userId = decoded.id;
            } catch (e2) {
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
// مسارات الكوبونات
// ============================================================
app.get('/api/get-coupons/:salonId', authMiddleware, async (req, res) => {
    try {
        console.log(`📡 جلب كوبونات للصالون: ${req.params.salonId}`);
        const coupons = await Coupon.find({ salonId: req.params.salonId });
        console.log(`📦 عدد الكوبونات: ${coupons.length}`);
        res.json(coupons);
    } catch (error) {
        console.error('❌ فشل جلب الكوبونات:', error);
        res.status(500).json({ message: 'فشل جلب الكوبونات' });
    }
});

app.post('/api/create-coupon', authMiddleware, async (req, res) => {
    try {
        const coupon = new Coupon(req.body);
        await coupon.save();
        res.status(201).json({ message: '✅ تم إنشاء الكوبون', coupon });
    } catch (error) {
        console.error('❌ فشل إنشاء الكوبون:', error);
        res.status(500).json({ message: 'فشل إنشاء الكوبون' });
    }
});

app.get('/api/get-coupon/:id', authMiddleware, async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json(coupon);
    } catch (error) {
        console.error('❌ فشل جلب الكوبون:', error);
        res.status(500).json({ message: 'فشل جلب الكوبون' });
    }
});

app.put('/api/update-coupon/:id', authMiddleware, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json({ message: '✅ تم تحديث الكوبون', coupon });
    } catch (error) {
        console.error('❌ فشل تحديث الكوبون:', error);
        res.status(500).json({ message: 'فشل تحديث الكوبون' });
    }
});

app.delete('/api/delete-coupon/:id', authMiddleware, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json({ message: '✅ تم حذف الكوبون' });
    } catch (error) {
        console.error('❌ فشل حذف الكوبون:', error);
        res.status(500).json({ message: 'فشل حذف الكوبون' });
    }
});

// ============================================================
// مسارات عروض الأسعار
// ============================================================
app.get('/api/quotes/:id', authMiddleware, async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id);
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        res.json(quote);
    } catch (error) {
        console.error('❌ فشل جلب تفاصيل الطلب:', error);
        res.status(500).json({ message: '❌ فشل جلب التفاصيل' });
    }
});

app.get('/api/quotes/customer-quotes/:customerId', async (req, res) => {
    try {
        const customerId = req.params.customerId;
        const quotes = await Quote.find({ customerId: customerId }).sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        console.error('❌ فشل جلب طلبات العميل:', error);
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

app.get('/api/quotes/salon/:salonId', authMiddleware, async (req, res) => {
    try {
        const quotes = await Quote.find({ salonId: req.params.salonId }).sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        console.error('❌ فشل جلب طلبات الصالون:', error);
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

app.put('/api/quotes/:id/quote', authMiddleware, async (req, res) => {
    try {
        const { quotePrice, quoteMessage } = req.body;
        const quote = await Quote.findById(req.params.id);
        if (!quote) return res.status(404).json({ message: '❌ الطلب غير موجود' });
        
        quote.quotePrice = quotePrice;
        quote.quoteMessage = quoteMessage || '';
        quote.status = 'quoted';
        await quote.save();

        // إشعار للعميل
        if (quote.customerId) {
            try {
                const salon = await Salon.findById(quote.salonId).select('name');
                const salonName = salon ? salon.name : 'الصالون';
                
                const notification = new Notification({
                    userId: quote.customerId,
                    userType: 'customer',
                    title: '📩 تم إرسال عرض سعر',
                    message: `تم إرسال عرض سعر لطلبك في صالون ${salonName}`,
                    read: false,
                    createdAt: new Date()
                });
                await notification.save();

                // ✅ Push Notification للعميل
                await sendPushNotification(
                    quote.customerId,
                    'customer',
                    '📩 تم إرسال عرض سعر',
                    `تم إرسال عرض سعر لطلبك في صالون ${salonName}`
                );

            } catch (e) { console.error('❌ فشل إشعار العميل:', e); }
        }

        res.json({ message: '✅ تم إرسال عرض السعر', quote });
    } catch (error) {
        console.error('❌ فشل إرسال عرض السعر:', error);
        res.status(500).json({ message: 'فشل إرسال عرض السعر' });
    }
});

app.put('/api/quotes/:id/accept-by-customer', customerAuthMiddleware, async (req, res) => {
    try {
        const { date, time } = req.body;
        const quote = await Quote.findById(req.params.id);
        if (!quote) return res.status(404).json({ message: '❌ الطلب غير موجود' });
        
        quote.status = 'accepted';
        await quote.save();

        // إشعار للصالون
        try {
            const notification = new Notification({
                userId: quote.salonId,
                userType: 'salon',
                title: '✅ تم قبول عرض سعر',
                message: `قام العميل ${quote.customerName} بقبول عرض السعر وتم إنشاء حجز تلقائي`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification للصالون
            await sendPushNotification(
                quote.salonId,
                'salon',
                '✅ تم قبول عرض سعر',
                `قام العميل ${quote.customerName} بقبول عرض السعر`
            );


        } catch (e) { console.error('❌ فشل الإشعار:', e); }

        res.json({ message: '✅ تم قبول العرض وإنشاء الحجز', appointment });
    } catch (error) {
        console.error('❌ فشل قبول العرض:', error);
        res.status(500).json({ message: 'فشل قبول العرض' });
    }
});

app.put('/api/quotes/:id/reject-by-customer', customerAuthMiddleware, async (req, res) => {
    try {
        const quote = await Quote.findById(req.params.id);
        if (!quote) return res.status(404).json({ message: '❌ الطلب غير موجود' });
        
        quote.status = 'rejected';
        await quote.save();

        // إشعار للصالون
        try {
            const notification = new Notification({
                userId: quote.salonId,
                userType: 'salon',
                title: '❌ تم رفض عرض سعر',
                message: `قام العميل ${quote.customerName} برفض عرض السعر`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();

            // ✅ Push Notification للصالون
            await sendPushNotification(
                quote.salonId,
                'salon',
                '❌ تم رفض عرض سعر',
                `قام العميل ${quote.customerName} برفض عرض السعر`
            );

        } catch (e) { console.error('❌ فشل الإشعار:', e); }

        res.json({ message: '❌ تم رفض عرض السعر' });
    } catch (error) {
        console.error('❌ فشل رفض العرض:', error);
        res.status(500).json({ message: 'فشل رفض العرض' });
    }
});

async function sendSubscriptionToServer(subscription) {
    const userId = localStorage.getItem('customerId') || 
                  localStorage.getItem('salonId') || 
                  localStorage.getItem('adminId');
    
    const userType = localStorage.getItem('customerToken') ? 'customer' :
                    localStorage.getItem('token') ? 'salon' :
                    localStorage.getItem('adminToken') ? 'admin' : null;

    if (!userId || !userType) {
        console.warn('⚠️ لا يوجد مستخدم مسجل لحفظ الاشتراك');
        return;
    }

    console.log('📤 إرسال الاشتراك إلى الخادم:', { userId, userType });

    try {
        let subscriptionData = {};
        
        if (subscription.toJSON) {
            subscriptionData = subscription.toJSON();
        } else {
            subscriptionData = {
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh')))) : '',
                    auth: subscription.getKey ? btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))) : ''
                }
            };
        }
        
        if (!subscriptionData.keys) {
            subscriptionData.keys = { p256dh: '', auth: '' };
        }
        
        if (!subscriptionData.keys.p256dh && subscription.getKey) {
            try {
                const p256dh = subscription.getKey('p256dh');
                if (p256dh) {
                    subscriptionData.keys.p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(p256dh)));
                }
            } catch (e) {
                console.warn('⚠️ فشل الحصول على p256dh:', e);
            }
        }
        
        if (!subscriptionData.keys.auth && subscription.getKey) {
            try {
                const auth = subscription.getKey('auth');
                if (auth) {
                    subscriptionData.keys.auth = btoa(String.fromCharCode.apply(null, new Uint8Array(auth)));
                }
            } catch (e) {
                console.warn('⚠️ فشل الحصول على auth:', e);
            }
        }

        console.log('📦 بيانات الاشتراك المرسلة:', subscriptionData);

        const res = await fetch(`${API_BASE}/push/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                userType: userType,
                subscription: subscriptionData,
                endpoint: subscription.endpoint
            })
        });

        const data = await res.json();
        console.log('✅ تم إرسال الاشتراك إلى الخادم:', data);
        updatePushButton(true);
        return data;

    } catch (error) {
        console.error('❌ فشل إرسال الاشتراك إلى الخادم:', error);
        try {
            console.log('🔄 محاولة إرسال بدون keys...');
            const simpleData = {
                endpoint: subscription.endpoint,
                keys: { p256dh: '', auth: '' }
            };
            
            const res = await fetch(`${API_BASE}/push/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: userId,
                    userType: userType,
                    subscription: simpleData,
                    endpoint: subscription.endpoint
                })
            });
            
            const data = await res.json();
            console.log('✅ تم إرسال الاشتراك بدون keys:', data);
            updatePushButton(true);
            return data;
        } catch (fallbackError) {
            console.error('❌ فشل الإرسال بدون keys:', fallbackError);
            throw error;
        }
    }
}

// ============================================================
// ✅ مسار اختبار إرسال Push يدوياً
// ============================================================
app.post('/api/push/test', async (req, res) => {
    try {
        const { userId, userType, title, message } = req.body;
        
        console.log('📤 طلب اختبار Push:', { userId, userType, title, message });
        
        if (!userId || !userType) {
            return res.status(400).json({ 
                success: false,
                message: 'userId و userType مطلوبان' 
            });
        }

        // التحقق من وجود اشتراكات
        const subscriptions = pushSubscriptions.filter(
            sub => sub.userId === userId && sub.userType === userType
        );

        console.log(`📊 عدد الاشتراكات للمستخدم ${userId}: ${subscriptions.length}`);

        if (subscriptions.length === 0) {
            return res.json({ 
                success: false,
                message: 'لا يوجد اشتراكات لهذا المستخدم. يرجى تفعيل الإشعارات أولاً.',
                subscriptionsCount: 0
            });
        }

        // إرسال الإشعار
        await sendPushNotification(
            userId,
            userType,
            title || '🧪 إشعار تجريبي',
            message || 'هذا إشعار تجريبي من منصة حلاقتي'
        );

        res.json({ 
            success: true,
            message: '✅ تم إرسال الإشعار التجريبي',
            subscriptionsCount: subscriptions.length
        });
        
    } catch (error) {
        console.error('❌ فشل اختبار الإشعار:', error);
        res.status(500).json({ 
            success: false,
            message: 'فشل الاختبار: ' + error.message 
        });
    }
});

// ============================================================
// تشغيل الخادم
// ============================================================
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
    console.log(`📡 Socket.io جاهز للإشعارات الفورية`);
    console.log(`🔔 Web Push Notifications (VAPID) جاهزة`);
});
