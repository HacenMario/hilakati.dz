const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  clientName: { type: String, required: true },
  clientPhone: { type: String, required: true },
  clientEmail: String,
  services: [{ name: String, price: Number }],
  totalPrice: { type: Number, default: 0 },
  staff: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
  payment: { type: String, enum: ['cash', 'online'], default: 'cash' },
  notes: String,
  recurring: { type: String, enum: ['none', 'weekly', 'monthly'], default: 'none' },
  
  // ============================================================
  // 🆕 حقول الكوبونات
  // ============================================================
  couponId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Coupon', 
    default: null 
  },
  couponCode: { 
    type: String, 
    default: null 
  },
  discountAmount: { 
    type: Number, 
    default: 0 
  },
  originalPrice: { 
    type: Number, 
    default: 0 
  },
  
  // ============================================================
  // 🆕 حقل تذكير الحجز
  // ============================================================
  reminderSent: { 
    type: Boolean, 
    default: false 
  }
  
}, { timestamps: true });

module.exports = mongoose.model('Appointment', AppointmentSchema);
