const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const auth = require('../middleware/auth');

// ✅ جلب جميع موظفي الصالون
router.get('/:salonId', auth, async (req, res) => {
    try {
        const staff = await Staff.find({ salonId: req.params.salonId, isActive: true });
        res.json(staff);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب الموظفين' });
    }
});

// ✅ إضافة موظف جديد
router.post('/', auth, async (req, res) => {
    try {
        const staff = new Staff(req.body);
        await staff.save();
        res.status(201).json({ message: '✅ تم إضافة الموظف', staff });
    } catch (error) {
        res.status(500).json({ message: 'فشل إضافة الموظف' });
    }
});

// ✅ تحديث موظف
router.put('/:id', auth, async (req, res) => {
    try {
        const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ message: '✅ تم تحديث الموظف', staff });
    } catch (error) {
        res.status(500).json({ message: 'فشل تحديث الموظف' });
    }
});

// ✅ حذف موظف
router.delete('/:id', auth, async (req, res) => {
    try {
        await Staff.findByIdAndDelete(req.params.id);
        res.json({ message: '✅ تم حذف الموظف' });
    } catch (error) {
        res.status(500).json({ message: 'فشل حذف الموظف' });
    }
});

// ✅ جلب جدول موظف
router.get('/schedule/:staffId', auth, async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.staffId).select('schedule');
        res.json(staff.schedule);
    } catch (error) {
        res.status(500).json({ message: 'فشل جلب الجدول' });
    }
});

// ✅ تحديث جدول موظف
router.put('/schedule/:staffId', auth, async (req, res) => {
    try {
        const staff = await Staff.findById(req.params.staffId);
        staff.schedule = req.body.schedule;
        await staff.save();
        res.json({ message: '✅ تم تحديث الجدول', schedule: staff.schedule });
    } catch (error) {
        res.status(500).json({ message: 'فشل تحديث الجدول' });
    }
});

// ✅ توزيع الحجوزات تلقائياً (أقترح موظف)
router.post('/auto-assign', auth, async (req, res) => {
    try {
        const { salonId, service, date, time } = req.body;
        
        // ✅ جلب الموظفين المتاحين
        const staff = await Staff.find({ 
            salonId, 
            isActive: true,
            [`schedule.${getDayName(date)}.start`]: { $lte: time },
            [`schedule.${getDayName(date)}.end`]: { $gte: time }
        });
        
        if (staff.length === 0) {
            return res.status(404).json({ message: '❌ لا يوجد موظفون متاحون' });
        }
        
        // ✅ اختيار الموظف الأقل حجوزات في هذا اليوم
        // (هذا مجرد مثال، يمكنك تحسينه)
        res.json({ message: '✅ تم توزيع الحجز', suggestedStaff: staff[0] });
    } catch (error) {
        res.status(500).json({ message: 'فشل توزيع الحجز' });
    }
});

function getDayName(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date(date).getDay()];
}

module.exports = router;
