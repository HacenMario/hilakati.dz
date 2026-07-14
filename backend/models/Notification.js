const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    userType: { type: String, enum: ['salon', 'customer', 'admin'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    link: { type: String, default: '' },
    appointmentTime: { type: String, default: '' },
    createdAt: { 
        type: Date, 
        default: Date.now // ✅ هذا السطر هو الحل النهائي!
    }
}, { timestamps: true }); // ✅ أضف هذا أيضاً (سيعطي createdAt و updatedAt تلقائياً)

module.exports = mongoose.model('Notification', NotificationSchema);
