const express = require('express');
const adminAuth = require('../middleware/adminAuth');
const Salon = require('../models/Salon');
const Customer = require('../models/Customer');
const Appointment = require('../models/Appointment');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const router = express.Router();

router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalSalons = await Salon.countDocuments();
    const totalCustomers = await Customer.countDocuments();
    const totalAppointments = await Appointment.countDocuments();
    const totalRevenue = await Appointment.aggregate([
      { $match: { status: { $in: ['confirmed', 'completed'] } } },
      { $group: { _id: null, total: { $sum: '$totalPrice' } } }
    ]);
    const pendingAppointments = await Appointment.countDocuments({ status: 'pending' });
    const totalReviews = await Review.countDocuments();
    res.json({
      totalSalons, totalCustomers, totalAppointments,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingAppointments, totalReviews
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/salons', adminAuth, async (req, res) => {
  const salons = await Salon.find().select('-password');
  res.json(salons);
});

router.get('/salons/:id', adminAuth, async (req, res) => {
  const salon = await Salon.findById(req.params.id).select('-password');
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  res.json(salon);
});

router.put('/salons/:id', adminAuth, async (req, res) => {
  const { name, city, address, phone, email } = req.body;
  const salon = await Salon.findById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  if (name) salon.name = name;
  if (city) salon.city = city;
  if (address) salon.address = address;
  if (phone) salon.phone = phone;
  if (email) salon.email = email;
  await salon.save();
  res.json({ message: '✅ تم التحديث', salon });
});

router.delete('/salons/:id', adminAuth, async (req, res) => {
  const salon = await Salon.findById(req.params.id);
  if (!salon) return res.status(404).json({ message: 'غير موجود' });
  await Appointment.deleteMany({ salonId: salon._id });
  await Review.deleteMany({ salonId: salon._id });
  await Notification.deleteMany({ userId: salon._id, userType: 'salon' });
  await salon.deleteOne();
  res.json({ message: 'تم الحذف' });
});

router.get('/customers', adminAuth, async (req, res) => {
  const customers = await Customer.find().select('-password');
  res.json(customers);
});

router.get('/customers/:id', adminAuth, async (req, res) => {
  const customer = await Customer.findById(req.params.id).select('-password');
  if (!customer) return res.status(404).json({ message: 'غير موجود' });
  res.json(customer);
});

router.put('/customers/:id', adminAuth, async (req, res) => {
  const { name, email, phone } = req.body;
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: 'غير موجود' });
  if (name) customer.name = name;
  if (email) customer.email = email;
  if (phone) customer.phone = phone;
  await customer.save();
  res.json({ message: '✅ تم التحديث', customer });
});

router.delete('/customers/:id', adminAuth, async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) return res.status(404).json({ message: 'غير موجود' });
  await Appointment.deleteMany({ customerId: customer._id });
  await Review.deleteMany({ customerId: customer._id });
  await Notification.deleteMany({ userId: customer._id, userType: 'customer' });
  await customer.deleteOne();
  res.json({ message: 'تم الحذف' });
});

router.get('/reviews', adminAuth, async (req, res) => {
  const reviews = await Review.find().populate('salonId', 'name').populate('customerId', 'name');
  res.json(reviews);
});

router.delete('/reviews/:id', adminAuth, async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'غير موجود' });
  await review.deleteOne();
  const salon = await Salon.findById(review.salonId);
  if (salon) {
    const reviews = await Review.find({ salonId: salon._id });
    const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    salon.rating = Math.round(avg * 10) / 10;
    salon.totalReviews = reviews.length;
    await salon.save();
  }
  res.json({ message: 'تم الحذف' });
});

router.get('/appointments', adminAuth, async (req, res) => {
  const appointments = await Appointment.find().populate('salonId', 'name').populate('customerId', 'name');
  res.json(appointments);
});

module.exports = router;
