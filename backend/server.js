const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

// إعداد Socket.io مع دعم CORS
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] }
});

// إعداد CORS للـ Express
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '50mb' }));

// ==================== قاعدة بيانات مؤقتة (في الذاكرة) ====================
// سيتم فقدان البيانات عند إعادة التشغيل، استخدم MongoDB للإنتاج الفعلي.
let salons = [];
let customers = [];
let appointments = [];
let reviews = [];
let notifications = [];
let admin = { email: 'admin@halaqti.com', password: 'admin123' };

let salonIdCounter = 1;
let customerIdCounter = 1;
let bookingIdCounter = 1;
let reviewIdCounter = 1;
let notifIdCounter = 1;

// صالون افتراضي للتجربة
salons.push({
  _id: '1',
  name: 'صالون النخبة',
  city: 'الجزائر العاصمة',
  address: 'شارع ديدوش مراد',
  phone: '0555123456',
  email: 'salon@test.com',
  password: '123456',
  desc: 'أفضل خدمات الحلاقة والتجميل',
  logo: '',
  salonType: 'mixed',
  isMobile: false,
  lat: 36.7538,
  lng: 3.0588,
  services: [{ name: 'حلاقة رجالي', price: 500 }, { name: 'صبغة', price: 1500 }],
  staff: ['أحمد', 'كريم'],
  hours: { 'الأحد': '09:00-18:00', 'الإثنين': '09:00-18:00', 'الثلاثاء': '09:00-18:00', 'الأربعاء': '09:00-18:00', 'الخميس': '09:00-18:00', 'الجمعة': '09:00-18:00', 'السبت': '09:00-18:00' },
  rating: 4.5,
  totalReviews: 10,
  featured: true,
  gallery: []
});

// ==================== دوال مساعدة ====================
function findSalonById(id) { return salons.find(s => s._id === id); }
function findCustomerById(id) { return customers.find(c => c._id === id); }
function findCustomerByEmail(email) { return customers.find(c => c.email === email); }
function findSalonByEmail(email) { return salons.find(s => s.email === email); }
function findAppointmentById(id) { return appointments.find(a => a._id === id); }

// استخراج المعرف من التوكن (التوكن = بادئة + المعرف)
function extractIdFromToken(token, prefix) {
  if (!token) return null;
  const parts = token.split(' ');
  if (parts.length === 2) {
    const t = parts[1];
    if (t.startsWith(prefix)) return t.replace(prefix, '');
    return null;
  }
  return null;
}

// ==================== Routes ====================

// --- الصالونات ---
app.get('/api/salons', (req, res) => res.json(salons));
app.get('/api/salons/:id', (req, res) => {
  const salon = findSalonById(req.params.id);
  salon ? res.json(salon) : res.status(404).json({ message: 'غير موجود' });
});

// تسجيل صالون
app.post('/api/auth/register', (req, res) => {
  const { name, city, address, email, phone, password, desc, logo, salonType, isMobile, lat, lng } = req.body;
  if (!name || !city || !email || !phone || password.length < 6) {
    return res.status(400).json({ message: 'بيانات ناقصة أو كلمة مرور ضعيفة' });
  }
  if (findSalonByEmail(email)) return res.status(400).json({ message: 'البريد موجود مسبقاً' });
  const newSalon = {
    _id: String(salonIdCounter++),
    name,
    city,
    address,
    email,
    phone,
    password,
    desc: desc || '',
    logo: logo || '',
    salonType: salonType || 'mixed',
    isMobile: isMobile || false,
    lat: lat || null,
    lng: lng || null,
    services: [],
    staff: [],
    hours: {},
    rating: 0,
    totalReviews: 0,
    featured: false,
    gallery: []
  };
  salons.push(newSalon);
  res.status(201).json({ token: 'salon-token-' + newSalon._id, salonId: newSalon._id, name: newSalon.name });
});

// دخول صالون
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const salon = findSalonByEmail(email);
  if (!salon || salon.password !== password) return res.status(401).json({ message: 'بيانات غير صحيحة' });
  res.json({ token: 'salon-token-' + salon._id, salonId: salon._id, name: salon.name });
});

// تغيير كلمة مرور الصالون
app.put('/api/auth/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const salonId = extractIdFromToken(authHeader, 'salon-token-');
  const salon = findSalonById(salonId);
  if (!salon) return res.status(401).json({ message: 'صالون غير موجود' });
  const { oldPassword, newPassword } = req.body;
  if (salon.password !== oldPassword) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'كلمة المرور الجديدة ضعيفة' });
  salon.password = newPassword;
  res.json({ message: 'تم التغيير' });
});

// تحديث بيانات الصالون (الإعدادات)
app.put('/api/salons/:id/settings', (req, res) => {
  const salon = findSalonById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  const { name, city, address, phone, desc, salonType, isMobile, gallery, lat, lng, logo } = req.body;
  if (name) salon.name = name;
  if (city) salon.city = city;
  if (address) salon.address = address;
  if (phone) salon.phone = phone;
  if (desc) salon.desc = desc;
  if (salonType) salon.salonType = salonType;
  if (isMobile !== undefined) salon.isMobile = isMobile;
  if (gallery) salon.gallery = gallery;
  if (lat !== undefined && lng !== undefined) { salon.lat = lat; salon.lng = lng; }
  if (logo) salon.logo = logo;
  res.json({ message: 'تم التحديث' });
});

// تحديث خدمات الصالون
app.put('/api/salons/:id/services', (req, res) => {
  const salon = findSalonById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  salon.services = req.body.services || [];
  res.json({ message: 'تم التحديث' });
});

// تحديث موظفي الصالون
app.put('/api/salons/:id/staff', (req, res) => {
  const salon = findSalonById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  salon.staff = req.body.staff || [];
  res.json({ message: 'تم التحديث' });
});

// تحديث ساعات العمل
app.put('/api/salons/:id/hours', (req, res) => {
  const salon = findSalonById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  salon.hours = req.body.hours || {};
  res.json({ message: 'تم التحديث' });
});

// حذف حساب الصالون
app.delete('/api/salons/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const salonId = extractIdFromToken(authHeader, 'salon-token-');
  const idx = salons.findIndex(s => s._id === salonId);
  if (idx === -1) return res.status(404).json({ message: 'غير موجود' });
  salons.splice(idx, 1);
  res.json({ message: 'تم الحذف' });
});

// --- العملاء ---
app.post('/api/customer/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || password.length < 6) {
    return res.status(400).json({ message: 'بيانات ناقصة' });
  }
  if (findCustomerByEmail(email)) return res.status(400).json({ message: 'البريد موجود' });
  const newCust = {
    _id: String(customerIdCounter++),
    name,
    email,
    phone,
    password
  };
  customers.push(newCust);
  res.json({ token: 'cust-token-' + newCust._id, customerId: newCust._id, name: newCust.name });
});

app.post('/api/customer/auth/login', (req, res) => {
  const { email, password } = req.body;
  const cust = findCustomerByEmail(email);
  if (!cust || cust.password !== password) return res.status(401).json({ message: 'بيانات غير صحيحة' });
  res.json({ token: 'cust-token-' + cust._id, customerId: cust._id, name: cust.name });
});

// جلب ملف العميل
app.get('/api/customer/auth/profile', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  const cust = findCustomerById(custId);
  if (!cust) return res.status(401).json({ message: 'غير موجود' });
  res.json(cust);
});

// تحديث ملف العميل
app.put('/api/customer/auth/profile', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  const cust = findCustomerById(custId);
  if (!cust) return res.status(401).json({ message: 'غير موجود' });
  const { name, email, phone } = req.body;
  if (name) cust.name = name;
  if (email) cust.email = email;
  if (phone) cust.phone = phone;
  res.json({ message: 'تم التحديث' });
});

// تغيير كلمة مرور العميل
app.put('/api/customer/auth/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  const cust = findCustomerById(custId);
  if (!cust) return res.status(401).json({ message: 'غير موجود' });
  const { oldPassword, newPassword } = req.body;
  if (cust.password !== oldPassword) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'كلمة المرور الجديدة ضعيفة' });
  cust.password = newPassword;
  res.json({ message: 'تم التغيير' });
});

// حذف حساب العميل
app.delete('/api/customer/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  const idx = customers.findIndex(c => c._id === custId);
  if (idx === -1) return res.status(404).json({ message: 'غير موجود' });
  customers.splice(idx, 1);
  res.json({ message: 'تم الحذف' });
});

// --- الحجوزات ---
app.post('/api/appointments/request', (req, res) => {
  const { salonId, customerId, clientName, clientPhone, clientEmail, services, totalPrice, staff, date, time, payment, notes, recurring } = req.body;
  const salon = findSalonById(salonId);
  if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });

  // تحقق من عدم تعارض الوقت
  const conflict = appointments.find(a => a.salonId === salonId && a.date === date && a.time === time && a.status !== 'cancelled');
  if (conflict) return res.status(409).json({ message: 'هذا الوقت محجوز مسبقاً' });

  const newBooking = {
    _id: String(bookingIdCounter++),
    salonId,
    customerId: customerId || null,
    clientName,
    clientPhone,
    clientEmail: clientEmail || '',
    services: services || [{ name: 'خدمة', price: 0 }],
    totalPrice: totalPrice || 0,
    staff: staff || 'موظف',
    date,
    time,
    payment: payment || 'cash',
    notes: notes || '',
    recurring: recurring || 'none',
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  appointments.push(newBooking);

  // إشعار للصالون
  notifications.push({
    _id: String(notifIdCounter++),
    userId: salonId,
    userType: 'salon',
    title: 'حجز جديد',
    message: `طلب حجز من ${clientName}`,
    read: false,
    createdAt: new Date().toISOString()
  });

  // إشعار للعميل إذا كان مسجلاً
  if (customerId) {
    notifications.push({
      _id: String(notifIdCounter++),
      userId: customerId,
      userType: 'customer',
      title: 'تم إرسال الطلب',
      message: `تم إرسال طلبك إلى ${salon.name}`,
      read: false,
      createdAt: new Date().toISOString()
    });
  }

  io.emit('new-notification', { title: 'حجز جديد', message: `طلب من ${clientName}` });
  res.status(201).json({ message: 'تم إرسال الطلب' });
});

// جلب حجوزات صالون معين (باستخدام التوكن)
app.get('/api/appointments', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json([]);
  const salonId = extractIdFromToken(authHeader, 'salon-token-');
  if (!salonId) return res.status(401).json([]);
  const myAppointments = appointments.filter(a => a.salonId === salonId);
  res.json(myAppointments);
});

// جلب حجوزات العميل المسجل (باستخدام التوكن)
app.get('/api/appointments/my', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json([]);
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  if (!custId) return res.status(401).json([]);
  // نبحث عن الحجوزات التي تحمل customerId أو رقم الهاتف (للتسجيل)
  const cust = findCustomerById(custId);
  if (!cust) return res.status(401).json([]);
  const myBookings = appointments.filter(a => a.customerId === custId || a.clientPhone === cust.phone);
  // نضيف اسم الصالون لكل حجز
  const enriched = myBookings.map(b => {
    const salon = findSalonById(b.salonId);
    return { ...b, salonId: salon ? { name: salon.name } : null };
  });
  res.json(enriched);
});

// جلب حجوزات برقم الهاتف (لغير المسجلين)
app.get('/api/appointments/client/:phone', (req, res) => {
  const phone = req.params.phone;
  const bookings = appointments.filter(a => a.clientPhone === phone);
  const enriched = bookings.map(b => {
    const salon = findSalonById(b.salonId);
    return { ...b, salonId: salon ? { name: salon.name } : null };
  });
  res.json(enriched);
});

// تحديث حالة الحجز
app.put('/api/appointments/:id/:action', (req, res) => {
  const booking = findAppointmentById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'غير موجود' });
  const action = req.params.action;
  if (action === 'confirm') booking.status = 'confirmed';
  else if (action === 'complete') booking.status = 'completed';
  else if (action === 'cancel') booking.status = 'cancelled';
  else return res.status(400).json({ message: 'إجراء غير معروف' });
  res.json({ message: 'تم التحديث' });
});

// --- التقييمات ---
app.post('/api/reviews', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'يجب تسجيل الدخول' });
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  if (!custId) return res.status(401).json({ message: 'يجب تسجيل الدخول' });
  const cust = findCustomerById(custId);
  if (!cust) return res.status(401).json({ message: 'مستخدم غير موجود' });

  const { salonId, rating, comment } = req.body;
  const salon = findSalonById(salonId);
  if (!salon) return res.status(404).json({ message: 'صالون غير موجود' });

  const newReview = {
    _id: String(reviewIdCounter++),
    salonId,
    customerName: cust.name,
    rating,
    comment,
    date: new Date().toISOString().split('T')[0]
  };
  reviews.push(newReview);

  // تحديث متوسط التقييم
  const salonReviews = reviews.filter(r => r.salonId === salonId);
  const avg = salonReviews.reduce((acc, r) => acc + r.rating, 0) / salonReviews.length;
  salon.rating = avg;
  salon.totalReviews = salonReviews.length;

  res.status(201).json({ message: 'تم إضافة التقييم' });
});

app.get('/api/reviews/salon/:id', (req, res) => {
  const salonReviews = reviews.filter(r => r.salonId === req.params.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(salonReviews);
});

// --- الإشعارات ---
app.get('/api/notifications/salon', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json([]);
  const salonId = extractIdFromToken(authHeader, 'salon-token-');
  if (!salonId) return res.status(401).json([]);
  const notifs = notifications.filter(n => n.userId === salonId && n.userType === 'salon').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(notifs);
});

app.get('/api/notifications/customer', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json([]);
  const custId = extractIdFromToken(authHeader, 'cust-token-');
  if (!custId) return res.status(401).json([]);
  const notifs = notifications.filter(n => n.userId === custId && n.userType === 'customer').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(notifs);
});

app.put('/api/notifications/read-all', (req, res) => {
  const { userId, userType } = req.body;
  if (!userId || !userType) return res.status(400).json({ message: 'بيانات ناقصة' });
  notifications.filter(n => n.userId === userId && n.userType === userType).forEach(n => n.read = true);
  res.json({ message: 'تم التحديث' });
});

// --- المدير ---
app.post('/api/admin/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email === admin.email && password === admin.password) {
    res.json({ token: 'admin-token-123', adminId: 'admin1' });
  } else res.status(401).json({ message: 'بيانات غير صحيحة' });
});

app.put('/api/admin/auth/change-password', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'غير مصرح' });
  const token = authHeader.split(' ')[1];
  if (token !== 'admin-token-123') return res.status(401).json({ message: 'غير مصرح' });
  const { oldPassword, newPassword } = req.body;
  if (admin.password !== oldPassword) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
  if (newPassword.length < 6) return res.status(400).json({ message: 'كلمة المرور الجديدة ضعيفة' });
  admin.password = newPassword;
  res.json({ message: 'تم التغيير' });
});

app.get('/api/admin/stats', (req, res) => {
  res.json({
    totalSalons: salons.length,
    totalCustomers: customers.length,
    totalAppointments: appointments.length,
    totalRevenue: appointments.filter(a => a.status === 'confirmed' || a.status === 'completed').reduce((sum, a) => sum + (a.totalPrice || 0), 0)
  });
});

app.get('/api/admin/salons', (req, res) => res.json(salons));
app.get('/api/admin/customers', (req, res) => res.json(customers));
app.get('/api/admin/reviews', (req, res) => res.json(reviews));

app.delete('/api/admin/salons/:id', (req, res) => {
  salons = salons.filter(s => s._id !== req.params.id);
  res.json({ message: 'تم الحذف' });
});

app.delete('/api/admin/customers/:id', (req, res) => {
  customers = customers.filter(c => c._id !== req.params.id);
  res.json({ message: 'تم الحذف' });
});

app.delete('/api/admin/reviews/:id', (req, res) => {
  reviews = reviews.filter(r => r._id !== req.params.id);
  res.json({ message: 'تم الحذف' });
});

// ==================== تشغيل الخادم ====================
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
