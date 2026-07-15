const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
    salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    value: { type: Number, required: true }, // نسبة مئوية أو قيمة ثابتة
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // أقصى خصم (للكوبونات النسبية)
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    usageLimit: { type: Number, default: 1 }, // عدد مرات الاستخدام
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    description: { type: String, default: '' },
    applicableServices: [{ type: String }] // إذا كان فارغاً، ينطبق على جميع الخدمات
}, { timestamps: true });

module.exports = mongoose.model('Coupon', CouponSchema);
