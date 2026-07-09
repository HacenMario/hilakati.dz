const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ✅ مسار الجذر (للتخلص من خطأ 404 عند زيارة الرابط الأساسي)
app.get('/', (req, res) => {
  res.send('🚀 مرحباً بك في منصة حلاقتي! API يعمل بنجاح. انتقل إلى /api/salons لعرض البيانات.');
});

// Socket.io
io.on('connection', (socket) => {
  console.log('🔌 عميل متصل:', socket.id);
  socket.on('join-salon', (salonId) => {
    socket.join(`salon-${salonId}`);
    console.log(`📌 صالون ${salonId} انضم`);
  });
  socket.on('join-customer', (customerId) => {
    socket.join(`customer-${customerId}`);
    console.log(`📌 عميل ${customerId} انضم`);
  });
  socket.on('disconnect', () => {
    console.log('🔌 عميل disconnected:', socket.id);
  });
});
app.set('io', io);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/customer/auth', require('./routes/customerAuth'));
app.use('/api/admin/auth', require('./routes/adminAuth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/salons', require('./routes/salons'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/notifications', require('./routes/notifications').router);

// Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات'))
  .catch(err => console.error('❌ فشل الاتصال:', err));

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على http://localhost:${PORT}`);
});
