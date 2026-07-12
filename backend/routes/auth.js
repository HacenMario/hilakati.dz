const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Salon = require('../models/Salon');
const auth = require('../middleware/auth');
const router = express.Router();

// ============================================================
// تسجيل صالون جديد
// ============================================================
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

// ============================================================
// دخول الصالون
// ============================================================
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

// ============================================================
// تغيير كلمة المرور (صالون)
// ============================================================
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

// ============================================================
// نسيان كلمة المرور - إرسال رابط إعادة التعيين
// ============================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email, userType } = req.body;
    
    // تحديد النموذج المناسب (صالون أو عميل)
    let Model;
    let userTypeLabel;
    if (userType === 'salon') {
      Model = require('../models/Salon');
      userTypeLabel = 'الصالون';
    } else if (userType === 'customer') {
      Model = require('../models/Customer');
      userTypeLabel = 'العميل';
    } else {
      return res.status(400).json({ message: '❌ نوع المستخدم غير صحيح' });
    }
    
    const user = await Model.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: '❌ هذا البريد غير مسجل' });
    }

    // إنشاء توكن إعادة تعيين (صلاحيته ساعة واحدة)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = Date.now() + 3600000; // ساعة واحدة

    // حفظ التوكن في قاعدة البيانات
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetExpires;
    await user.save();

    // بناء رابط إعادة التعيين
    const frontendUrl = process.env.FRONTEND_URL || 'https://halakati-project.vercel.app';
    const resetLink = `${frontendUrl}?token=${resetToken}&userType=${userType}`;

    // تسجيل الرابط في وحدة التحكم (للتطوير)
    console.log(`🔑 رابط إعادة التعيين لـ ${userTypeLabel} (${email}):`);
    console.log(resetLink);

    // في الإنتاج، استخدم nodemailer لإرسال البريد الإلكتروني
    // يمكنك تفعيل إرسال البريد الإلكتروني هنا

    res.json({ 
      message: `✅ تم إرسال رابط إعادة التعيين إلى ${email} (تحقق من البريد الإلكتروني أو وحدة التحكم)`,
      resetLink: process.env.NODE_ENV === 'development' ? resetLink : undefined
    });

  } catch (error) {
    console.error('❌ خطأ في forgot-password:', error);
    res.status(500).json({ message: error.message });
  }
});

// ============================================================
// إعادة تعيين كلمة المرور
// ============================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: '❌ بيانات غير صالحة. كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // البحث عن مستخدم في جدول الصالونات
    let user = await Salon.findOne({ 
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    // إذا لم يوجد، البحث في جدول العملاء
    if (!user) {
      const Customer = require('../models/Customer');
      user = await Customer.findOne({ 
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
      });
    }

    if (!user) {
      return res.status(400).json({ message: '❌ رابط غير صالح أو منتهي الصلاحية' });
    }

    // تحديث كلمة المرور
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: '✅ تم تغيير كلمة المرور بنجاح' });

  } catch (error) {
    console.error('❌ خطأ في reset-password:', error);
    res.status(500).json({ message: error.message });
  }
});

// ============================================================
// التحقق من صحة توكن إعادة التعيين (اختياري)
// ============================================================
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ valid: false, message: '❌ التوكن مطلوب' });
    }

    const Salon = require('../models/Salon');
    const Customer = require('../models/Customer');

    let user = await Salon.findOne({ 
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      user = await Customer.findOne({ 
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() }
      });
    }

    if (!user) {
      return res.json({ valid: false, message: '❌ رابط غير صالح أو منتهي الصلاحية' });
    }

    res.json({ valid: true, message: '✅ التوكن صالح' });

  } catch (error) {
    console.error('❌ خطأ في verify-reset-token:', error);
    res.status(500).json({ valid: false, message: error.message });
  }
});

module.exports = router;
