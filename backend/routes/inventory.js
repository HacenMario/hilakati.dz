const express = require('express');
const router = express.Router();
const Inventory = require('../models/Inventory');
const auth = require('../middleware/auth');

// ============================================================
// ✅ جلب جميع منتجات المخزون لصالون معين
// ============================================================
router.get('/:salonId', auth, async (req, res) => {
    try {
        const items = await Inventory.find({ 
            salonId: req.params.salonId,
            isActive: true 
        }).sort({ createdAt: -1 });
        res.json(items);
    } catch (error) {
        console.error('❌ فشل جلب المخزون:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ جلب منتج واحد
// ============================================================
router.get('/item/:id', auth, async (req, res) => {
    try {
        const item = await Inventory.findOne({ 
            _id: req.params.id,
            salonId: req.userId 
        });
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json(item);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ جلب المنتجات المنخفضة (أقل من الحد الأدنى)
// ============================================================
router.get('/low-stock/:salonId', auth, async (req, res) => {
    try {
        const items = await Inventory.find({
            salonId: req.params.salonId,
            isActive: true,
            $expr: { $lte: ['$quantity', '$minQuantity'] }
        });
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ إضافة منتج جديد
// ============================================================
router.post('/', auth, async (req, res) => {
    try {
        const { name, category, quantity, minQuantity, unit, price, supplier, notes } = req.body;
        const salonId = req.userId;

        const item = new Inventory({
            salonId,
            name,
            category,
            quantity: quantity || 0,
            minQuantity: minQuantity || 5,
            unit: unit || 'قطعة',
            price: price || 0,
            supplier: supplier || '',
            notes: notes || ''
        });

        await item.save();
        res.status(201).json({ message: '✅ تم إضافة المنتج', item });
    } catch (error) {
        console.error('❌ فشل إضافة المنتج:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ تحديث منتج
// ============================================================
router.put('/:id', auth, async (req, res) => {
    try {
        const { name, category, quantity, minQuantity, unit, price, supplier, notes, isActive } = req.body;
        const item = await Inventory.findOneAndUpdate(
            { _id: req.params.id, salonId: req.userId },
            { name, category, quantity, minQuantity, unit, price, supplier, notes, isActive },
            { new: true }
        );
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json({ message: '✅ تم تحديث المنتج', item });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ حذف منتج (إلغاء التنشيط)
// ============================================================
router.delete('/:id', auth, async (req, res) => {
    try {
        const item = await Inventory.findOneAndUpdate(
            { _id: req.params.id, salonId: req.userId },
            { isActive: false },
            { new: true }
        );
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json({ message: '✅ تم حذف المنتج' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ===== تحديث ربط المنتج بخدمة =====
router.put('/:id/service', auth, async (req, res) => {
    try {
        const { serviceId, serviceName } = req.body;
        const updateData = {};
        
        if (serviceId !== undefined) {
            updateData.serviceId = serviceId || null;
        }
        if (serviceName !== undefined) {
            updateData.serviceName = serviceName || '';
        }
        
        const item = await Inventory.findOneAndUpdate(
            { _id: req.params.id, salonId: req.userId },
            updateData,
            { new: true }
        );
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json(item);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ تحديث كمية الاستهلاك لكل حجز (جديد)
// ============================================================
router.put('/:id/consumption', auth, async (req, res) => {
    try {
        const { consumptionPerBooking } = req.body;
        const item = await Inventory.findOneAndUpdate(
            { _id: req.params.id, salonId: req.userId },
            { consumptionPerBooking: consumptionPerBooking || 0 },
            { new: true }
        );
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json({ message: '✅ تم تحديث الاستهلاك', item });
    } catch (error) {
        console.error('❌ فشل تحديث الاستهلاك:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ إعادة تعبئة المخزون (جديد)
// ============================================================
router.put('/:id/restock', auth, async (req, res) => {
    try {
        const { quantity } = req.body;
        if (!quantity || quantity <= 0) {
            return res.status(400).json({ message: 'الكمية يجب أن تكون أكبر من 0' });
        }

        const item = await Inventory.findOne({ 
            _id: req.params.id, 
            salonId: req.userId 
        });
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });

        item.quantity += quantity;
        item.lastRestocked = new Date();
        await item.save();

        // ✅ إشعار بإعادة التعبئة (اختياري)
        try {
            const Notification = require('../models/Notification');
            const notification = new Notification({
                userId: req.userId,
                userType: 'salon',
                title: '📦 تم إعادة تعبئة المخزون',
                message: `تم إضافة ${quantity} ${item.unit} من ${item.name} (المخزون الحالي: ${item.quantity})`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();
        } catch (notifError) {
            console.warn('⚠️ فشل إرسال إشعار إعادة التعبئة:', notifError);
        }

        res.json({ 
            message: `✅ تم إضافة ${quantity} ${item.unit} إلى ${item.name}`,
            item 
        });
    } catch (error) {
        console.error('❌ فشل إعادة التعبئة:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ تقرير استهلاك المخزون (جديد)
// ============================================================
router.get('/report/:salonId', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const query = { 
            salonId: req.params.salonId,
            isActive: true 
        };
        
        // فلترة حسب التاريخ (اختياري)
        if (startDate && endDate) {
            query.updatedAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }
        
        const items = await Inventory.find(query).populate('serviceId', 'name');
        
        const report = items.map(item => ({
            id: item._id,
            name: item.name,
            category: item.category,
            unit: item.unit,
            initialQuantity: item.quantity + item.totalConsumed,
            consumed: item.totalConsumed,
            currentQuantity: item.quantity,
            consumptionPerBooking: item.consumptionPerBooking || 0,
            serviceName: item.serviceId ? item.serviceId.name : 'غير مرتبط',
            minQuantity: item.minQuantity,
            status: item.quantity <= item.minQuantity ? '⚠️ منخفض' : '✅ كافٍ'
        }));
        
        // إحصائيات إضافية
        const stats = {
            totalItems: items.length,
            totalValue: items.reduce((sum, item) => sum + (item.quantity * item.price), 0),
            lowStockItems: items.filter(item => item.quantity <= item.minQuantity).length,
            mostConsumed: items.sort((a, b) => b.totalConsumed - a.totalConsumed).slice(0, 5)
        };
        
        res.json({ report, stats });
    } catch (error) {
        console.error('❌ فشل جلب تقرير المخزون:', error);
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ تحديث كمية المنتج يدوياً
// ============================================================
router.put('/:id/quantity', auth, async (req, res) => {
    try {
        const { quantity } = req.body;
        if (quantity === undefined || quantity < 0) {
            return res.status(400).json({ message: 'الكمية يجب أن تكون رقمًا صحيحًا غير سالب' });
        }

        const item = await Inventory.findOneAndUpdate(
            { _id: req.params.id, salonId: req.userId },
            { quantity },
            { new: true }
        );
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        
        res.json({ message: '✅ تم تحديث الكمية', item });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ============================================================
// ✅ حذف منتج نهائياً (حذف فعلي)
// ============================================================
router.delete('/:id/permanent', auth, async (req, res) => {
    try {
        const item = await Inventory.findOneAndDelete({ 
            _id: req.params.id, 
            salonId: req.userId 
        });
        if (!item) return res.status(404).json({ message: 'المنتج غير موجود' });
        res.json({ message: '✅ تم حذف المنتج نهائياً' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
