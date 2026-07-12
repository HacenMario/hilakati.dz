const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userType: { type: String, enum: ['salon', 'customer', 'admin'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    link: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
    appointmentTime: { type: String, default: '' }
});

module.exports = mongoose.model('Notification', NotificationSchema);
