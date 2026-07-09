const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const adminAuth = require('../middleware/adminAuth');
const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ message: 'بيانات غير صحيحة' });
    if (!(await admin.matchPassword(password))) {
      return res.status(400).json({ message: 'بيانات غير صحيحة' });
    }
    const token = jwt.sign({ id: admin._id }, process.env.JWT_ADMIN_SECRET, { expiresIn: '30d' });
    res.json({ token, adminId: admin._id, name: admin.name });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/change-password', adminAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.adminId);
    if (!admin) return res.status(404).json({ message: 'غير موجود' });
    if (!(await admin.matchPassword(oldPassword))) {
      return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    }
    admin.password = newPassword;
    await admin.save();
    res.json({ message: '✅ تم تغيير كلمة المرور' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;