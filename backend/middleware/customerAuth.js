const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // ✅ استخراج التوكن من رأس Authorization
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: '❌ غير مصرح: لا يوجد توكن' });
    }

    try {
        // ✅ التحقق من التوكن باستخدام المفتاح السري
        const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key');
        req.customerId = decoded.id; // حفظ معرف العميل في الطلب
        next(); // المتابعة إلى الدالة التالية
    } catch (error) {
        console.error('❌ فشل التحقق من توكن العميل:', error.message);
        return res.status(401).json({ message: '❌ توكن غير صالح أو منتهي الصلاحية' });
    }
};
