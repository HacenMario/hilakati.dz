const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Admin = require('./models/Admin');
dotenv.config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ متصل بقاعدة البيانات');
    const existing = await Admin.findOne({ email: 'admin@halakati.dz' });
    if (existing) { console.log('⚠️ المدير موجود مسبقاً'); process.exit(); }
    const admin = new Admin({ email: 'admin@halakati.dz', password: 'Admin1234', name: 'مدير النظام' });
    await admin.save();
    console.log('✅ تم إنشاء المدير: admin@halakati.dz / Admin1234');
    process.exit();
  })
  .catch(err => { console.error('❌ فشل:', err); process.exit(1); });