const express = require('express');
const customerAuth = require('../middleware/customerAuth');
const Review = require('../models/Review');
const Salon = require('../models/Salon');
const Appointment = require('../models/Appointment');
const router = express.Router();

router.post('/', customerAuth, async (req, res) => {
  try {
    const { salonId, rating, comment } = req.body;
    const customer = await Customer.findById(req.customerId);
    if (!customer) return res.status(404).json({ message: 'عميل غير موجود' });
    const appointment = await Appointment.findOne({ salonId, customerId: req.customerId, status: 'completed' });
    if (!appointment) {
      return res.status(403).json({ message: 'لا يمكنك تقييم هذا الصالون دون حجز مكتمل' });
    }
    const review = new Review({ salonId, customerId: req.customerId, customerName: customer.name, rating, comment });
    await review.save();
    const reviews = await Review.find({ salonId });
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    await Salon.findByIdAndUpdate(salonId, { rating: Math.round(avg * 10) / 10, totalReviews: reviews.length });
    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/salon/:salonId', async (req, res) => {
  const reviews = await Review.find({ salonId: req.params.salonId }).sort({ createdAt: -1 });
  res.json(reviews);
});

module.exports = router;