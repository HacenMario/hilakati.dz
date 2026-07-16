const jwt = require('jsonwebtoken');

// ✅ مفتاح ثابت (نفس المفتاح المستخدم في server.js)
const CUSTOMER_JWT_SECRET = 'another_secret_for_customers';

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        console.warn('❌ customerAuth: لا يوجد توكن');
        return res.status(401).json({ message: '❌ غير مصرح: لا يوجد توكن' });
    }

    try {
        console.log(`🔑 customerAuth: التحقق بالمفتاح الثابت: "${CUSTOMER_JWT_SECRET}"`);
        const decoded = jwt.verify(token, CUSTOMER_JWT_SECRET);
        req.customerId = decoded.id;
        console.log(`✅ customerAuth: تم التحقق من العميل ${req.customerId}`);
        next();
    } catch (error) {
        console.error('❌ customerAuth: فشل التحقق:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: '❌ انتهت صلاحية التوكن' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: '❌ توكن غير صالح (تنسيق أو توقيع)' });
        }
        return res.status(401).json({ message: '❌ توكن غير صالح' });
    }
};
