const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: '❌ غير مصرح: لا يوجد توكن' });
    }
    try {
        const secret = process.env.JWT_CUSTOMER_SECRET || 'customer_secret_key';
        const decoded = jwt.verify(token, secret);
        req.customerId = decoded.id;
        next();
    } catch (error) {
        console.error('❌ customerAuth فشل:', error.message);
        return res.status(401).json({ message: '❌ توكن غير صالح' });
    }
};
