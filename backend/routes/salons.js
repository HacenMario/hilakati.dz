const express = require('express');
const auth = require('../middleware/auth');
const Salon = require('../models/Salon');
const Appointment = require('../models/Appointment');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const router = express.Router();

// ✅ جلب كل الصالونات (بدون صور - لتحسين الأداء)
router.get('/', async (req, res) => {
  try {
    const salons = await Salon.find().select('-password -logo -gallery');
    res.json(salons);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ جلب صالون واحد (بدون صورة)
router.get('/:id', async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.id).select('-password -logo -gallery');
    if (!salon) return res.status(404).json({ message: 'غير موجود' });
    res.json(salon);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ جلب صورة اللوغو فقط (تُستخدم عند عرض تفاصيل الصالون)
router.get('/:id/logo', async (req, res) => {
  try {
    const salon = await Salon.findById(req.params.id).select('logo');
    if (!salon || !salon.logo) {
      return res.status(404).json({ message: 'Logo غير موجود' });
    }
    
    // تحويل Base64 إلى صورة
    const base64Data = salon.logo.replace(/^data:image\/\w+;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');
    
    res.set('Content-Type', 'image/png');
    res.send(imgBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ تحديث خدمات الصالون
router.put('/:id/services', auth, async (req, res) => {
  const { services } = req.body;
  const salon = await Salon.findById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  if (salon._id.toString() !== req.salonId) return res.status(403).json({ message: 'غير مصرح' });
  salon.services = services;
  await salon.save();
  res.json({ message: 'تم التحديث', services: salon.services });
});

// ✅ تحديث فريق العمل
router.put('/:id/staff', auth, async (req, res) => {
  const { staff } = req.body;
  const salon = await Salon.findById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  if (salon._id.toString() !== req.salonId) return res.status(403).json({ message: 'غير مصرح' });
  salon.staff = staff;
  await salon.save();
  res.json({ message: 'تم التحديث', staff: salon.staff });
});

// ✅ تحديث ساعات العمل
router.put('/:id/hours', auth, async (req, res) => {
  const { hours } = req.body;
  const salon = await Salon.findById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  if (salon._id.toString() !== req.salonId) return res.status(403).json({ message: 'غير مصرح' });
  salon.hours = hours;
  await salon.save();
  res.json({ message: 'تم التحديث', hours: salon.hours });
});

// ✅ تحديث إعدادات الصالون (الملف الشخصي)
router.put('/:id/settings', auth, async (req, res) => {
  const { name, city, address, phone, desc, salonType, isMobile, gallery, lat, lng, logo } = req.body;
  const salon = await Salon.findById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  if (salon._id.toString() !== req.salonId) return res.status(403).json({ message: 'غير مصرح' });
  if (name) salon.name = name;
  if (city) salon.city = city;
  if (address) salon.address = address;
  if (phone) salon.phone = phone;
  if (desc !== undefined) salon.desc = desc;
  if (salonType) salon.salonType = salonType;
  if (isMobile !== undefined) salon.isMobile = isMobile;
  if (gallery) salon.gallery = gallery;
  if (lat !== undefined && lng !== undefined) { salon.lat = lat; salon.lng = lng; }
  if (logo) salon.logo = logo;
  await salon.save();
  res.json({ message: 'تم التحديث', salon });
});

// ✅ حذف الصالون وجميع بياناته المرتبطة
router.delete('/me', auth, async (req, res) => {
  const salon = await Salon.findById(req.salonId);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  await Appointment.deleteMany({ salonId: salon._id });
  await Review.deleteMany({ salonId: salon._id });
  await Notification.deleteMany({ userId: salon._id, userType: 'salon' });
  await salon.deleteOne();
  res.json({ message: 'تم الحذف' });
});

module.exports = router;
