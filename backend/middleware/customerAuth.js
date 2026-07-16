const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // ✅ استخراج التوكن من رأس Authorization
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        console.warn('❌ customerAuth: لا يوجد توكن');
        return res.status(401).json({ message: '❌ غير مصرح: لا يوجد توكن' });
    }

    try {
        // ✅ التحقق من التوكن مع مفتاح احتياطي
        const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key');
        req.customerId = decoded.id;
        console.log(`✅ customerAuth: تم التحقق من العميل ${req.customerId}`);
        next();
    } catch (error) {
        console.error('❌ customerAuth: فشل التحقق:', error.message);
        return res.status(401).json({ message: '❌ توكن غير صالح أو منتهي الصلاحية' });
    }
};
