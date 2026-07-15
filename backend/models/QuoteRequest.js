const mongoose = require('mongoose');

const QuoteRequestSchema = new mongoose.Schema({
    salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerEmail: { type: String },
    serviceType: { type: String, required: true }, // مكياج عرايس، تسريحة، إلخ
    description: { type: String, required: true },
    budget: { type: Number, default: 0 },
    eventDate: { type: Date },
    images: [{ type: String }], // روابط صور مرجعية
    status: {
        type: String,
        enum: ['pending', 'quoted', 'accepted', 'rejected', 'expired'],
        default: 'pending'
    },
    quotePrice: { type: Number, default: 0 },
    quoteMessage: { type: String, default: '' },
    quoteDate: { type: Date },
    expiryDate: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('QuoteRequest', QuoteRequestSchema);
