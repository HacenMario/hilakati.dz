const express = require('express');
const router = express.Router();
const Inventory = require('../models/Inventory');
const auth = require('../middleware/auth');

// ✅ جلب المخزون
router.get('/:salonId', auth, async (req, res) => {
    try {
        const inventory = await Inventory.find({ salonId: req.params.salonId, isActive: true });
        res.json(inventory);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب المخزون' });
    }
});

// ✅ إضافة منتج جديد
router.post('/', auth, async (req, res) => {
    try {
        const item = new Inventory(req.body);
        await item.save();
        res.status(201).json({ message: '✅ تم إضافة المنتج', item });
    } catch (error) {
        res.status(500).json({ message: 'فشل إضافة المنتج' });
    }
});
// ✅ تحديث منتج
router.put('/:id', async (req, res) => {
    try {
        const item = await Inventory.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!item) {
            return res.status(404).json({ message: '❌ المنتج غير موجود' });
        }
        res.json({ message: '✅ تم تحديث المنتج', item });
    } catch (error) {
        res.status(500).json({ message: 'فشل تحديث المنتج' });
    }
});

// ✅ تحديث الكمية
router.put('/:id/quantity', auth, async (req, res) => {
    try {
        const { quantity } = req.body;
        const item = await Inventory.findByIdAndUpdate(
            req.params.id,
            { quantity, lastRestocked: new Date() },
            { new: true }
        );
        res.json({ message: '✅ تم تحديث الكمية', item });
    } catch (error) {
        res.status(500).json({ message: 'فشل تحديث الكمية' });
    }
});

// ✅ جلب المنتجات المنخفضة
router.get('/low-stock/:salonId', async (req, res) => {
    try {
        // استخدم $expr للمقارنة بين حقلين في نفس المستند
        const items = await Inventory.find({
            salonId: req.params.salonId,
            isActive: true,
            $expr: { $lte: ["$quantity", "$minQuantity"] }
        });
        res.json(items);
    } catch (error) {
        console.error('❌ خطأ في جلب المنتجات المنخفضة:', error);
        res.status(500).json({ message: 'فشل جلب المنتجات المنخفضة' });
    }
});
// ✅ حذف منتج
router.delete('/:id', auth, async (req, res) => {
    try {
        await Inventory.findByIdAndDelete(req.params.id);
        res.json({ message: '✅ تم حذف المنتج' });
    } catch (error) {
        res.status(500).json({ message: 'فشل حذف المنتج' });
    }
});

// ✅ تقرير استهلاك المنتجات (مثال)
router.get('/report/:salonId', auth, async (req, res) => {
    try {
        const items = await Inventory.find({ salonId: req.params.salonId });
        // ✅ هنا يمكنك إضافة منطق لتوليد تقرير
        res.json(items);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب التقرير' });
    }
});

module.exports = router;
