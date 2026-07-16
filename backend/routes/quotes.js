const express = require('express');
const router = express.Router();
const QuoteRequest = require('../models/Quote');
const auth = require('../middleware/auth');
const customerAuthMiddleware = require('../middleware/customerAuth');

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
// ✅ جلب طلبات العميل
// ============================================================
router.get('/customer/:customerId', auth, async (req, res) => {
    try {
        const quotes = await QuoteRequest.find({ customerId: req.params.customerId })
            .sort({ createdAt: -1 });
        res.json(quotes);
    } catch (error) {
        console.error('❌ فشل جلب طلبات العميل:', error);
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
                expiryDate: expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 أيام افتراضياً
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
// ✅ قبول عرض السعر
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
// ✅ رفض عرض السعر
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
// ✅ قبول عرض السعر من قبل الزبون
// ============================================================
router.put('/:id/accept-by-customer', customerAuthMiddleware, async (req, res) => {
    try {
        const quote = await QuoteRequest.findById(req.params.id);
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        // ✅ التحقق من أن الزبون هو صاحب الطلب
        if (quote.customerId && quote.customerId.toString() !== req.customerId) {
            return res.status(403).json({ message: '❌ غير مصرح لك بقبول هذا العرض' });
        }
        
        // ✅ التحقق من أن الحالة مناسبة
        if (quote.status !== 'quoted') {
            return res.status(400).json({ message: '❌ لا يمكن قبول هذا العرض لأنه ليس في حالة "quoted"' });
        }
        
        quote.status = 'accepted';
        await quote.save();
        
        // ✅ إشعار للصالون
        try {
            const Notification = require('../models/Notification');
            const notification = new Notification({
                userId: quote.salonId,
                userType: 'salon',
                title: '✅ تم قبول عرض السعر',
                message: `قام العميل ${quote.customerName} بقبول عرض السعر الخاص بك`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();
        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
        }
        
        res.json({ message: '✅ تم قبول عرض السعر بنجاح', quote });
    } catch (error) {
        console.error('❌ فشل قبول عرض السعر:', error);
        res.status(500).json({ message: 'فشل قبول عرض السعر' });
    }
});

// ============================================================
// ✅ رفض عرض السعر من قبل الزبون
// ============================================================
router.put('/:id/reject-by-customer', customerAuthMiddleware, async (req, res) => {
    try {
        const quote = await QuoteRequest.findById(req.params.id);
        if (!quote) {
            return res.status(404).json({ message: '❌ الطلب غير موجود' });
        }
        
        // ✅ التحقق من أن الزبون هو صاحب الطلب
        if (quote.customerId && quote.customerId.toString() !== req.customerId) {
            return res.status(403).json({ message: '❌ غير مصرح لك برفض هذا العرض' });
        }
        
        // ✅ التحقق من أن الحالة مناسبة
        if (quote.status !== 'quoted') {
            return res.status(400).json({ message: '❌ لا يمكن رفض هذا العرض لأنه ليس في حالة "quoted"' });
        }
        
        quote.status = 'rejected';
        await quote.save();
        
        // ✅ إشعار للصالون
        try {
            const Notification = require('../models/Notification');
            const notification = new Notification({
                userId: quote.salonId,
                userType: 'salon',
                title: '❌ تم رفض عرض السعر',
                message: `قام العميل ${quote.customerName} برفض عرض السعر الخاص بك`,
                read: false,
                createdAt: new Date()
            });
            await notification.save();
        } catch (notifError) {
            console.error('❌ فشل إرسال الإشعار:', notifError);
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
// ✅ جلب طلبات عروض الأسعار الخاصة بعميل معين (للعميل نفسه)
// ============================================================
router.get('/customer/:customerId', customerAuthMiddleware, async (req, res) => {
    try {
        // التأكد من أن العميل يطلب بياناته الخاصة فقط
        if (req.params.customerId !== req.customerId) {
            return res.status(403).json({ message: '❌ غير مصرح لك بعرض طلبات عميل آخر' });
        }

        const quotes = await QuoteRequest.find({ customerId: req.params.customerId })
            .sort({ createdAt: -1 });
            
        res.json(quotes);
    } catch (error) {
        console.error('❌ فشل جلب طلبات العميل:', error);
        res.status(500).json({ message: 'فشل جلب الطلبات' });
    }
});

module.exports = router;
