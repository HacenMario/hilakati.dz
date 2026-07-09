const express = require('express');
const jwt = require('jsonwebtoken');
const Customer = require('../models/Customer');
const customerAuth = require('../middleware/customerAuth');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    const existing = await Customer.findOne({ email });
    if (existing) return res.status(400).json({ message: 'البريد مستخدم' });
    const customer = new Customer({ name, email, phone, password });
    await customer.save();
    const token = jwt.sign({ id: customer._id }, process.env.JWT_CUSTOMER_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, customerId: customer._id, name: customer.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const customer = await Customer.findOne({ email });
    if (!customer) return res.status(400).json({ message: 'بيانات غير صحيحة' });
    const isMatch = await customer.matchPassword(password);
    if (!isMatch) return res.status(400).json({ message: 'بيانات غير صحيحة' });
    const token = jwt.sign({ id: customer._id }, process.env.JWT_CUSTOMER_SECRET, { expiresIn: '30d' });
    res.json({ token, customerId: customer._id, name: customer.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/profile', customerAuth, async (req, res) => {
  const customer = await Customer.findById(req.customerId).select('-password');
  res.json(customer);
});

router.put('/profile', customerAuth, async (req, res) => {
  const { name, email, phone } = req.body;
  const customer = await Customer.findById(req.customerId);
  if (name) customer.name = name;
  if (email) customer.email = email;
  if (phone) customer.phone = phone;
  await customer.save();
  res.json({ message: 'تم التحديث', customer: { name: customer.name, email: customer.email, phone: customer.phone } });
});

router.put('/change-password', customerAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ message: 'غير موجود' });
    if (!(await customer.matchPassword(oldPassword))) {
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    }
    customer.password = newPassword;
    await customer.save();
    res.json({ message: '✅ تم تغيير كلمة المرور' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/me', customerAuth, async (req, res) => {
  const customer = await Customer.findById(req.customerId);
  if (!customer) return res.status(404).json({ message: 'غير موجود' });
  await Appointment.deleteMany({ customerId: customer._id });
  await Review.deleteMany({ customerId: customer._id });
  await Notification.deleteMany({ userId: customer._id, userType: 'customer' });
  await customer.deleteOne();
  res.json({ message: 'تم الحذف' });
});

module.exports = router;