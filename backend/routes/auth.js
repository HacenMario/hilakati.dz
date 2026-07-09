const express = require('express');
const jwt = require('jsonwebtoken');
const Salon = require('../models/Salon');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, city, address, phone, desc, logo, salonType, isMobile, lat, lng } = req.body;
    const existing = await Salon.findOne({ email });
    if (existing) return res.status(400).json({ message: 'البريد مستخدم' });
    const salon = new Salon({ email, password, name, city, address, phone, desc, logo, salonType, isMobile, lat, lng });
    await salon.save();
    const token = jwt.sign({ id: salon._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, salonId: salon._id, name: salon.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const salon = await Salon.findOne({ email });
    if (!salon) return res.status(400).json({ message: 'بيانات غير صحيحة' });
    const isMatch = await salon.matchPassword(password);
    if (!isMatch) return res.status(400).json({ message: 'بيانات غير صحيحة' });
    const token = jwt.sign({ id: salon._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, salonId: salon._id, name: salon.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/change-password', auth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const salon = await Salon.findById(req.salonId);
    if (!salon) return res.status(404).json({ message: 'غير موجود' });
    if (!(await salon.matchPassword(oldPassword))) {
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    }
    salon.password = newPassword;
    await salon.save();
    res.json({ message: '✅ تم تغيير كلمة المرور' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;