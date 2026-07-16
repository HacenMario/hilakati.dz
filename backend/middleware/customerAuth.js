const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // ✅ استخراج التوكن من رأس Authorization
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        console.warn('❌ customerAuth: لا يوجد توكن');
        return res.status(401).json({ message: '❌ غير مصرح: لا يوجد توكن' });
    }

    try {
        // ✅ استخدام المفتاح السري من المتغيرات البيئية أو المفتاح الاحتياطي
        const secret = process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key';
        
        // ✅ تسجيل المفتاح المستخدم للتحقق (كامل للتحقق من التطابق)
        console.log(`🔑 customerAuth: المفتاح المستخدم للتحقق: "${secret}"`);
        
        // ✅ التحقق من صحة التوكن
        const decoded = jwt.verify(token, secret);
        req.customerId = decoded.id;
        
        console.log(`✅ customerAuth: تم التحقق من العميل ${req.customerId}`);
        next();
    } catch (error) {
        console.error('❌ customerAuth: فشل التحقق:', error.message);
        
        // ✅ رسائل خطأ محددة حسب نوع الخطأ
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: '❌ انتهت صلاحية التوكن' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: '❌ توكن غير صالح (تنسيق أو توقيع)' });
        }
        return res.status(401).json({ message: '❌ توكن غير صالح' });
    }
};
