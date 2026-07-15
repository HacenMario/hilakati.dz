const mongoose = require('mongoose');

const StaffSchema = new mongoose.Schema({
    salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    position: { type: String, enum: ['coiffeur', 'barber', 'esthetician', 'manager', 'assistant'], default: 'coiffeur' },
    specialties: [String],
    commissionRate: { type: Number, default: 0 },
    schedule: {
        monday: { start: String, end: String, breaks: [{ start: String, end: String }] },
        tuesday: { start: String, end: String, breaks: [{ start: String, end: String }] },
        wednesday: { start: String, end: String, breaks: [{ start: String, end: String }] },
        thursday: { start: String, end: String, breaks: [{ start: String, end: String }] },
        friday: { start: String, end: String, breaks: [{ start: String, end: String }] },
        saturday: { start: String, end: String, breaks: [{ start: String, end: String }] },
        sunday: { start: String, end: String, breaks: [{ start: String, end: String }] }
    },
    maxBookingsPerDay: { type: Number, default: 10 },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Staff', StaffSchema);
