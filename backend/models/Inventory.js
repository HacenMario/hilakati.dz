const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
    salonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Salon', required: true },
    name: { type: String, required: true },
    category: { type: String, enum: ['products', 'tools', 'furniture', 'consumables'], default: 'products' },
    quantity: { type: Number, required: true, default: 0 },
    minQuantity: { type: Number, default: 5 },
    unit: { type: String, default: 'قطعة' },
    price: { type: Number, default: 0 },
    supplier: { type: String, default: '' },
    lastRestocked: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Inventory', InventorySchema);
