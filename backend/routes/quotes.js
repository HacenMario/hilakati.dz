const express = require('express');
const router = express.Router();
const QuoteRequest = require('../models/Quote');
const auth = require('../middleware/auth');
// ✅ تم حذف سطر customerAuthMiddleware لأنه غير مستخدم حالياً

// ============================================================
// ✅ جلب طلبات عرض السعر (للصالون)
// ============================================================
router.get('/salon/:salonId', auth, async (req, res) => {
    try {
        const quotes = await QuoteRequest.find({ salonId: req.params.salonId })
            .sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        console.error('❌ فشل جلب طلبات الصالون:', error);
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

// ============================================================
// ✅ إنشاء طلب عرض سعر جديد (مسار عام - لا يحتاج مصادقة)
// ============================================================
router.post('/', async (req, res) => {
    try {
        const quote = new QuoteRequest(req.body);
        await quote.save();
        
        // ✅ إشعار للصالون (اختياري)
        try {
            const Notification = require('../models/Notification');
            const salon = require('../models/Salon');
            const salonData = await salon.findById(req.body.salonId);
            if (salonData) {
                const notification = new Notification({
                    userId: req.body.salonId,
                    userType: 'salon',
                    title: '📩 طلب عرض سعر جديد',
                    message: `طلب جديد من ${req.body.customerName} لخدمة "${req.body.serviceType}"`,
                    read: false,
                    createdAt: new Date()
                });
                await notification.save();
            }
        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
        }
        
        res.status(201).json({ 
            message: '✅ تم إرسال طلب عرض السعر', 
            quote 
        });
    } catch (error) {
        console.error('❌ فشل إنشاء الطلب:', error);
        res.status(500).json({ message: 'فشل إرسال الطلب: ' + error.message });
    }
});

// ============================================================
// ✅ جلب تفاصيل طلب عرض سعر واحد
// ============================================================
router.get('/:id', auth, async (req, res) => {
    try {
        const quote = await QuoteRequest.findById(req.params.id);
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        res.json(quote);
    } catch (error) {
        console.error('❌ فشل جلب تفاصيل الطلب:', error);
        res.status(500).json({ message: '❌ فشل جلب التفاصيل' });
    }
});

// ============================================================
// ✅ رد الصالون بعرض سعر
// ============================================================
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
                expiryDate: expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            },
            { new: true }
        );
        
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        res.json({ message: '✅ تم إرسال عرض السعر', quote });
    } catch (error) {
        console.error('❌ فشل إرسال عرض السعر:', error);
        res.status(500).json({ message: 'فشل إرسال عرض السعر' });
    }
});

// ============================================================
// ✅ قبول عرض السعر (من قبل الصالون)
// ============================================================
router.put('/:id/accept', auth, async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndUpdate(
            req.params.id,
            { status: 'accepted' },
            { new: true }
        );
        
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        res.json({ message: '✅ تم قبول عرض السعر', quote });
    } catch (error) {
        console.error('❌ فشل قبول عرض السعر:', error);
        res.status(500).json({ message: 'فشل قبول عرض السعر' });
    }
});

// ============================================================
// ✅ رفض عرض السعر (من قبل الصالون)
// ============================================================
router.put('/:id/reject', auth, async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndUpdate(
            req.params.id,
            { status: 'rejected' },
            { new: true }
        );
        
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        res.json({ message: '❌ تم رفض عرض السعر', quote });
    } catch (error) {
        console.error('❌ فشل رفض عرض السعر:', error);
        res.status(500).json({ message: 'فشل رفض عرض السعر' });
    }
});

// ============================================================
// ✅ تحديث طلب عرض سعر (بيانات عامة)
// ============================================================
router.put('/:id', async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );
        
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        res.json({ message: '✅ تم تحديث الطلب', quote });
    } catch (error) {
        console.error('❌ فشل تحديث الطلب:', error);
        res.status(500).json({ message: 'فشل تحديث الطلب' });
    }
});

// ============================================================
// ✅ حذف طلب عرض سعر
// ============================================================
router.delete('/:id', auth, async (req, res) => {
    try {
        const quote = await QuoteRequest.findByIdAndDelete(req.params.id);
        
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        res.json({ message: '✅ تم حذف الطلب بنجاح' });
    } catch (error) {
        console.error('❌ فشل حذف الطلب:', error);
        res.status(500).json({ message: '❌ فشل حذف الطلب' });
    }
});

// ============================================================
// ✅ جلب طلبات عروض الأسعار الخاصة بالعميل (مسار جديد - عام)
// ============================================================
router.get('/customer-quotes/:customerId', async (req, res) => {
    try {
        const customerId = req.params.customerId;
        const Customer = require('../models/Customer');
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: '❌ العميل غير موجود' });
        }
        const quotes = await QuoteRequest.find({ customerId: customerId })
            .sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        console.error('❌ فشل جلب طلبات العميل:', error);
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

module.exports = router;
