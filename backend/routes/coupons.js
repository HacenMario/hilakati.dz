const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const auth = require('../middleware/auth');

// ✅ جلب جميع الكوبونات
router.get('/:salonId', auth, async (req, res) => {
    try {
        const coupons = await Coupon.find({ salonId: req.params.salonId });
        res.json(coupons);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب الكوبونات' });
    }
});

// ✅ إنشاء كوبون جديد
router.post('/', auth, async (req, res) => {
    try {
        // ✅ إنشاء كود فريد إذا لم يتم توفيره
        if (!req.body.code) {
            req.body.code = generateCouponCode();
        }
        const coupon = new Coupon(req.body);
        await coupon.save();
        res.status(201).json({ message: '✅ تم إنشاء الكوبون', coupon });
    } catch (error) {
        res.status(500).json({ message: 'فشل إنشاء الكوبون' });
    }
});

// ✅ التحقق من صلاحية الكوبون
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
        
        // ✅ حساب الخصم
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
        res.status(500).json({ message: 'فشل التحقق من الكوبون' });
    }
});
// ✅ تحديث كوبون
router.put('/:id', async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!coupon) {
            return res.status(404).json({ message: '❌ الكوبون غير موجود' });
        }
        res.json({ message: '✅ تم تحديث الكوبون', coupon });
    } catch (error) {
        res.status(500).json({ message: 'فشل تحديث الكوبون' });
    }
});

// ✅ استخدام كوبون
router.put('/use/:id', auth, async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id,
            { $inc: { usedCount: 1 } },
            { new: true }
        );
        res.json({ message: '✅ تم استخدام الكوبون', coupon });
    } catch (error) {
        res.status(500).json({ message: 'فشل استخدام الكوبون' });
    }
});

// ✅ حذف كوبون
router.delete('/:id', auth, async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ message: '✅ تم حذف الكوبون' });
    } catch (error) {
        res.status(500).json({ message: 'فشل حذف الكوبون' });
    }
});

function generateCouponCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

module.exports = router;
