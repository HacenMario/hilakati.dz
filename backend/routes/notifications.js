const express = require('express');
const auth = require('../middleware/auth');
const customerAuth = require('../middleware/customerAuth');
const Notification = require('../models/Notification');
const router = express.Router();

const addNotification = async (userId, userType, title, message) => {
  const notification = new Notification({ userId, userType, title, message });
  await notification.save();
  return notification;
};

router.get('/salon', auth, async (req, res) => {
  const notifications = await Notification.find({ userId: req.salonId, userType: 'salon' }).sort({ createdAt: -1 });
  res.json(notifications);
});

router.get('/customer', customerAuth, async (req, res) => {
  const notifications = await Notification.find({ userId: req.customerId, userType: 'customer' }).sort({ createdAt: -1 });
  res.json(notifications);
});

router.put('/read-all', async (req, res) => {
  const { userId, userType } = req.body;
  await Notification.updateMany({ userId, userType, read: false }, { read: true });
  res.json({ message: 'تم تحديد الكل كمقروء' });
});

module.exports = { router, addNotification };