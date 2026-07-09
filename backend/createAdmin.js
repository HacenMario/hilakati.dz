// createAdmin.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Admin = require('./models/Admin');

dotenv.config();

// الاتصال بقاعدة البيانات
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ تم الاتصال بقاعدة البيانات');

    try {
      // التحقق من وجود المدير مسبقاً
      const existingAdmin = await Admin.findOne({ email: 'admin@halakati.dz' });
      if (existingAdmin) {
        console.log('⚠️ حساب المدير موجود مسبقاً!');
        process.exit();
      }

      // إنشاء حساب المدير
      const admin = new Admin({
        email: 'admin@halakati.dz',
        password: 'Admin1234',
        name: 'مدير النظام'
      });

      await admin.save();
      console.log('✅ تم إنشاء حساب المدير بنجاح!');
      console.log('📧 البريد: admin@halakati.dz');
      console.log('🔑 كلمة المرور: Admin1234');
      console.log('⚠️ يرجى تغيير كلمة المرور بعد تسجيل الدخول لأول مرة.');
      
    } catch (error) {
      console.error('❌ خطأ في إنشاء المدير:', error.message);
    }

    process.exit();
  })
  .catch(err => {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err);
    process.exit(1);
  });