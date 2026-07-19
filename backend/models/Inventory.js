const mongoose = require('mongoose');

const InventorySchema = new mongoose.Schema({
    // ✅ الحقول الأساسية (موجودة مسبقاً)
    salonId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Salon', 
        required: true 
    },
    name: { 
        type: String, 
        required: true 
    },
    category: { 
        type: String, 
        enum: ['products', 'tools', 'furniture', 'consumables'], 
        default: 'products' 
    },
    quantity: { 
        type: Number, 
        required: true, 
        default: 0,
        min: 0 
    },
    minQuantity: { 
        type: Number, 
        default: 5 
    },
    unit: { 
        type: String, 
        default: 'قطعة' 
    },
    price: { 
        type: Number, 
        default: 0 
    },
    supplier: { 
        type: String, 
        default: '' 
    },
    lastRestocked: { 
        type: Date, 
        default: Date.now 
    },
    notes: { 
        type: String, 
        default: '' 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    },

    // ✅ الحقول الجديدة لربط المخزون بالخدمات والاستهلاك التلقائي
    serviceId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Service', 
        default: null,
        description: 'الخدمة المرتبطة بهذا المنتج (يستهلك عند حجزها)'
    },
    consumptionPerBooking: { 
        type: Number, 
        default: 0,
        min: 0,
        description: 'كمية المنتج التي تستهلك في كل حجز للخدمة المرتبطة'
    },
    totalConsumed: { 
        type: Number, 
        default: 0,
        min: 0,
        description: 'إجمالي الكمية المستهلكة منذ بداية التسجيل'
    }

}, { timestamps: true });

// ✅ فهرس لتحسين أداء الاستعلامات
InventorySchema.index({ salonId: 1, serviceId: 1 });
InventorySchema.index({ salonId: 1, category: 1 });
InventorySchema.index({ salonId: 1, isActive: 1 });

module.exports = mongoose.model('Inventory', InventorySchema);
