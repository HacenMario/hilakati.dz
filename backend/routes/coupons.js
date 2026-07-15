const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');

const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const Salon = require('../models/Salon'); // ✅ تأكد من استيراد نموذج الصالون
const auth = require('../middleware/auth');

// ============================================================
// ✅ توليد كود كوبون بناءً على اسم الصالون
// ============================================================
function generateCouponCode(salonName) {
    // تنظيف الاسم
    const cleanName = salonName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').substring(0, 6);
    // 4 أحرف عشوائية
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let random = '';
    for (let i = 0; i < 4; i++) {
        random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${cleanName}${random}`.toUpperCase();
}

// ============================================================
// ✅ جلب جميع كوبونات صالون
// ============================================================
router.get('/:salonId', auth, async (req, res) => {
    try {
        const coupons = await Coupon.find({ salonId: req.params.salonId });
        res.json(coupons);
    } catch (error) {
        console.error('❌ فشل جلب الكوبونات:', error);
        res.status(500).json({ message: 'فشل جلب الكوبونات' });
    }
});

// ============================================================
// ✅ إنشاء كوبون جديد (مع توليد كود حسب اسم الصالون)
// ============================================================
router.post('/', auth, async (req, res) => {
    try {
        // ✅ إذا لم يتم توفير كود، قم بتوليده بناءً على اسم الصالون
        if (!req.body.code) {
            const salon = await Salon.findById(req.body.salonId).select('name');
            req.body.code = generateCouponCode(salon ? salon.name : 'SALON');
        }
        const coupon = new Coupon(req.body);
        await coupon.save();
        res.status(201).json({ message: '✅ تم إنشاء الكوبون', coupon });
    } catch (error) {
        console.error('❌ فشل إنشاء الكوبون:', error);
        res.status(500).json({ message: 'فشل إنشاء الكوبون' });
    }
});

// ============================================================
// ✅ 3. تحديث كوبون
// ============================================================
router.put('/:id', auth, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json({ message: '✅ تم تحديث الكوبون', coupon });
    } catch (error) {
        console.error('❌ فشل تحديث الكوبون:', error);
        res.status(500).json({ message: 'فشل تحديث الكوبون' });
    }
});

// ============================================================
// ✅ 4. استخدام كوبون (زيادة عدد الاستخدامات)
// ============================================================
router.put('/use/:id', auth, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            { $inc: { usedCount: 1 } },
            { new: true }
        );
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json({ message: '✅ تم استخدام الكوبون', coupon });
    } catch (error) {
        console.error('❌ فشل استخدام الكوبون:', error);
        res.status(500).json({ message: 'فشل استخدام الكوبون' });
    }
});

// ============================================================
// ✅ 5. التحقق من صلاحية الكوبون
// ============================================================
router.post('/validate', async (req, res) => {
    try {
        const { code, salonId, total } = req.body;
        const coupon = await Coupon.findOne({ code, salonId, isActive: true });
        
        if (!coupon) {
            return res.status(404).json({ message: '❌ كوبون غير صالح' });
        }
        
        const now = new Date();
        if (now < coupon.validFrom || now > coupon.validUntil) {
            return res.status(400).json({ message: '❌ انتهت صلاحية الكوبون' });
        }
        
        if (coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ message: '❌ تم استخدام الكوبون بالكامل' });
        }
        
        if (total < coupon.minOrder) {
            return res.status(400).json({ message: `❌ الحد الأدنى للطلب هو ${coupon.minOrder} دج` });
        }
        
        let discount = 0;
        if (coupon.type === 'percentage') {
            discount = (total * coupon.value) / 100;
            if (coupon.maxDiscount > 0) {
                discount = Math.min(discount, coupon.maxDiscount);
            }
        } else {
            discount = coupon.value;
        }
        
        res.json({
            valid: true,
            coupon,
            discount: Math.round(discount),
            newTotal: total - discount
        });
    } catch (error) {
        console.error('❌ فشل التحقق من الكوبون:', error);
        res.status(500).json({ message: 'فشل التحقق من الكوبون' });
    }
});

// ============================================================
// ✅ 6. حذف كوبون
// ============================================================
router.delete('/:id', auth, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndDelete(req.params.id);
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json({ message: '✅ تم حذف الكوبون' });
    } catch (error) {
        console.error('❌ فشل حذف الكوبون:', error);
        res.status(500).json({ message: 'فشل حذف الكوبون' });
    }
});

// ============================================================
// ✅ دالة مساعدة: توليد كود كوبون عشوائي
// ============================================================
function generateCouponCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

module.exports = router;
