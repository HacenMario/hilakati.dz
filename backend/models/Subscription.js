const mongoose = require('mongoose');

const SubscriptionSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
  plan: { type: String, enum: ['basic', 'premium', 'enterprise'], default: 'basic' },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  features: {
    maxBookingsPerDay: { type: Number, default: 10 },
    analytics: { type: Boolean, default: false },
    featuredListing: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false }
  }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', SubscriptionSchema);