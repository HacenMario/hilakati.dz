const express = require('express');
const router = express.Router();
const QuoteRequest = require('../models/Quote');
const auth = require('../middleware/auth');

// ✅ جلب طلبات عرض السعر (للصالون)
router.get('/salon/:salonId', auth, async (req, res) => {
    try {
        const quotes = await QuoteRequest.find({ salonId: req.params.salonId })
            .sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

// ✅ جلب طلبات العميل
router.get('/customer/:customerId', auth, async (req, res) => {
    try {
        const quotes = await QuoteRequest.find({ customerId: req.params.customerId })
            .sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

// ✅ إنشاء طلب عرض سعر جديد
router.post('/', async (req, res) => {
    try {
        const quote = new QuoteRequest(req.body);
        await quote.save();
        
        // ✅ إشعار للصالون (يمكن إضافته لاحقاً)
        res.status(201).json({ message: '✅ تم إرسال طلب عرض السعر', quote });
    } catch (error) {
        res.status(500).json({ message: 'فشل إرسال الطلب' });
    }
});

// ✅ رد الصالون بعرض سعر
router.put('/:id/quote', auth, async (req, res) => {
    try {
        const { quotePrice, quoteMessage, expiryDate } = req.body;
        const quote = await QuoteRequest.findByIdAndUpdate(
            req.params.id,
            {
                status: 'quoted',
                quotePrice,
                quoteMessage,
                quoteDate: new Date(),
                expiryDate: expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 أيام افتراضياً
            },
            { new: true }
        );
        res.json({ message: '✅ تم إرسال عرض السعر', quote });
    } catch (error) {
        res.status(500).json({ message: 'فشل إرسال عرض السعر' });
    }
});

// ✅ قبول عرض السعر
router.put('/:id/accept', auth, async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndUpdate(
            req.params.id,
            { status: 'accepted' },
            { new: true }
        );
        res.json({ message: '✅ تم قبول عرض السعر', quote });
    } catch (error) {
        res.status(500).json({ message: 'فشل قبول عرض السعر' });
    }
});

// ✅ رفض عرض السعر
router.put('/:id/reject', auth, async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndUpdate(
            req.params.id,
            { status: 'rejected' },
            { new: true }
        );
        res.json({ message: '❌ تم رفض عرض السعر', quote });
    } catch (error) {
        res.status(500).json({ message: 'فشل رفض عرض السعر' });
    }
});
// ✅ تحديث طلب عرض سعر
router.put('/:id', async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        res.json({ message: '✅ تم تحديث الطلب', quote });
    } catch (error) {
        res.status(500).json({ message: 'فشل تحديث الطلب' });
    }
});

module.exports = router;
