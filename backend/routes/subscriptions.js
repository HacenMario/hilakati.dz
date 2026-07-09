const express = require('express');
const auth = require('../middleware/auth');
const Subscription = require('../models/Subscription');
const Salon = require('../models/Salon');
const router = express.Router();

// خطط الاشتراك
const PLANS = {
  basic: { maxBookingsPerDay: 10, analytics: false, featuredListing: false, prioritySupport: false, price: 0 },
  premium: { maxBookingsPerDay: 30, analytics: true, featuredListing: true, prioritySupport: false, price: 5000 },
  enterprise: { maxBookingsPerDay: 100, analytics: true, featuredListing: true, prioritySupport: true, price: 15000 }
};

// جلب خطة الاشتراك الحالية
router.get('/my', auth, async (req, res) => {
  try {
    const salon = await Salon.findById(req.salonId).populate('subscriptionId');
    if (!salon) return res.status(404).json({ message: 'غير موجود' });
    const plan = salon.subscriptionId || { plan: 'basic', features: PLANS.basic };
    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ترقية الاشتراك
router.post('/upgrade', auth, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ message: 'خطة غير صالحة' });
    
    const salon = await Salon.findById(req.salonId);
    if (!salon) return res.status(404).json({ message: 'غير موجود' });
    
    const subscription = new Subscription({
      salonId: salon._id,
      plan,
      features: PLANS[plan],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 يوم
    });
    await subscription.save();
    
    salon.subscriptionId = subscription._id;
    await salon.save();
    
    res.json({ message: `✅ تم الترقية إلى ${plan}`, subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;