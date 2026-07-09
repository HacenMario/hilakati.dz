const express = require('express');
const customerAuth = require('../middleware/customerAuth');
const auth = require('../middleware/auth');
const Chat = require('../models/Chat');
const router = express.Router();

// جلب محادثة بين عميل وصالون (أو إنشاؤها)
router.get('/:salonId', customerAuth, async (req, res) => {
  try {
    const { salonId } = req.params;
    const customerId = req.customerId;
    let chat = await Chat.findOne({ salonId, customerId, status: 'active' });
    if (!chat) {
      chat = new Chat({ salonId, customerId, messages: [] });
      await chat.save();
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// إرسال رسالة (من عميل أو صالون)
router.post('/:chatId/message', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { sender, senderId, message } = req.body;
    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ message: 'المحادثة غير موجودة' });
    chat.messages.push({ sender, senderId, message, read: false, createdAt: new Date() });
    await chat.save();
    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// جلب جميع محادثات الصالون (للصالون)
router.get('/salon/all', auth, async (req, res) => {
  try {
    const chats = await Chat.find({ salonId: req.salonId, status: 'active' }).populate('customerId', 'name email profileImage');
    res.json(chats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// إغلاق المحادثة (للصالون)
router.put('/:chatId/close', auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ message: 'غير موجود' });
    if (chat.salonId.toString() !== req.salonId) {
      return res.status(403).json({ message: 'غير مصرح' });
    }
    chat.status = 'closed';
    await chat.save();
    res.json({ message: 'تم إغلاق المحادثة' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;