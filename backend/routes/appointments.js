const express = require('express');
const auth = require('../middleware/auth');
const customerAuth = require('../middleware/customerAuth');
const Appointment = require('../models/Appointment');
const Salon = require('../models/Salon');
const { addNotification } = require('./notifications');
const router = express.Router();

router.get('/', auth, async (req, res) => {
  const appointments = await Appointment.find({ salonId: req.salonId }).sort({ date: -1 });
  res.json(appointments);
});

router.get('/my', customerAuth, async (req, res) => {
  const bookings = await Appointment.find({ customerId: req.customerId }).populate('salonId', 'name city phone');
  res.json(bookings);
});

router.get('/client/:phone', async (req, res) => {
  const bookings = await Appointment.find({ clientPhone: req.params.phone }).populate('salonId', 'name city phone');
  res.json(bookings);
});

router.post('/request', async (req, res) => {
  try {
    const { salonId, date, time, staff, clientName, clientPhone, clientEmail, services, totalPrice, payment, notes, customerId, recurring } = req.body;
    const conflict = await Appointment.findOne({ salonId, date, time, staff, status: { $ne: 'cancelled' } });
    if (conflict) return res.status(409).json({ message: 'هذا الوقت محجوز' });
    const appointment = new Appointment({
      salonId, customerId: customerId || null, clientName, clientPhone, clientEmail,
      services, totalPrice, staff, date, time, payment, notes, recurring: recurring || 'none'
    });
    await appointment.save();
    const salon = await Salon.findById(salonId);
    if (salon) {
      await addNotification(salonId, 'salon', '📅 طلب حجز جديد', `العميل ${clientName} طلب حجز ${services.map(s=>s.name).join(', ')} في ${date} ${time}`);
    }
    res.status(201).json({ message: 'تم إرسال طلب الحجز', appointment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/confirm', auth, async (req, res) => {
  const app = await Appointment.findOne({ _id: req.params.id, salonId: req.salonId }).populate('salonId', 'name');
  if (!app) return res.status(404).json({ message: 'غير موجود' });
  app.status = 'confirmed';
  await app.save();
  if (app.customerId) {
    await addNotification(app.customerId, 'customer', '✅ تم تأكيد حجزك', `تم تأكيد حجزك في ${app.salonId?.name} يوم ${app.date} ${app.time}`);
  }
  res.json(app);
});

router.put('/:id/cancel', auth, async (req, res) => {
  const app = await Appointment.findOne({ _id: req.params.id, salonId: req.salonId }).populate('salonId', 'name');
  if (!app) return res.status(404).json({ message: 'غير موجود' });
  app.status = 'cancelled';
  await app.save();
  if (app.customerId) {
    await addNotification(app.customerId, 'customer', '❌ تم إلغاء حجزك', `تم إلغاء حجزك في ${app.salonId?.name} يوم ${app.date}`);
  }
  res.json(app);
});

router.put('/:id/complete', auth, async (req, res) => {
  const app = await Appointment.findOne({ _id: req.params.id, salonId: req.salonId }).populate('salonId', 'name');
  if (!app) return res.status(404).json({ message: 'غير موجود' });
  app.status = 'completed';
  await app.save();
  if (app.customerId) {
    await addNotification(app.customerId, 'customer', '✅ تم إكمال حجزك', `تم إكمال حجزك في ${app.salonId?.name}`);
  }
  res.json(app);
});

router.put('/:id/cancel-client', customerAuth, async (req, res) => {
  const app = await Appointment.findOne({ _id: req.params.id, customerId: req.customerId }).populate('salonId', 'name');
  if (!app) return res.status(404).json({ message: 'غير موجود' });
  app.status = 'cancelled';
  await app.save();
  await addNotification(app.salonId, 'salon', '❌ إلغاء من العميل', `العميل ${app.clientName} ألغى حجزه`);
  res.json(app);
});

module.exports = router;