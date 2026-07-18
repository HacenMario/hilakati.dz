const ReviewSchema = new mongoose.Schema({
    salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    // ✅ حقل الصورة الجديد
    image: { type: String, default: null }, // Base64
    date: { type: String, default: () => new Date().toISOString().split('T')[0] }
}, { timestamps: true });

module.exports = mongoose.model('Review', ReviewSchema);
