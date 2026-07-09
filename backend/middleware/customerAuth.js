const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'غير مصرح' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_CUSTOMER_SECRET);
    req.customerId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: 'توكن غير صالح' });
  }
};