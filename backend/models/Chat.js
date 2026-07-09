const mongoose = require('mongoose');

const ChatSchema = new mongoose.Schema({
  salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  messages: [{
    sender: { type: String, enum: ['salon', 'customer', 'admin'], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['active', 'closed'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.model('Chat', ChatSchema);