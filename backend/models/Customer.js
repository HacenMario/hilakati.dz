const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  password: { type: String, required: true },
  isBlocked: { type: Boolean, default: false },           // <-- تم إضافة الحقل هنا
  resetPasswordToken: { type: String, default: null },    // <-- لإعادة تعيين كلمة المرور
  resetPasswordExpires: { type: Number, default: null }   // <-- صلاحية التوكن
}, { timestamps: true });

// ============================================================
// تشفير كلمة المرور قبل الحفظ
// ============================================================
CustomerSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ============================================================
// التحقق من كلمة المرور
// ============================================================
CustomerSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Customer', CustomerSchema);
