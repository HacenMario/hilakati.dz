const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SalonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  address: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  desc: String,
  logo: { type: String, default: '' },
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  tags: [String],
  featured: { type: Boolean, default: false },
  staff: [String],
  services: [{ name: String, price: Number }],
  hours: { type: Map, of: String },
  lat: Number,
  lng: Number,
  salonType: { type: String, enum: ['male', 'female', 'children', 'mixed'], default: 'mixed' },
  isMobile: { type: Boolean, default: false },
  gallery: [String],
  isActive: { type: Boolean, default: true },           // <-- تم إضافة الحقل هنا
  resetPasswordToken: { type: String, default: null },  // <-- لإعادة تعيين كلمة المرور
  resetPasswordExpires: { type: Number, default: null } // <-- صلاحية التوكن
}, { timestamps: true });

// ============================================================
// تشفير كلمة المرور قبل الحفظ
// ============================================================
SalonSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// ============================================================
// التحقق من كلمة المرور
// ============================================================
SalonSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Salon', SalonSchema);
