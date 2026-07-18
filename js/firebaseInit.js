// تهيئة Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBvVft2tK7uCW2lK1BzFfJEqcfi2BfRKIY",
  authDomain: "hilakatidz.firebaseapp.com",
  projectId: "hilakatidz",
  storageBucket: "hilakatidz.firebasestorage.app",
  messagingSenderId: "254055907785",
  appId: "1:254055907785:web:c3d2164dcc8cc110aa2818",
  measurementId: "G-5H5C0Q83H1"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// ✅ طلب إذن الإشعارات والحصول على التوكن
async function requestNotificationPermission() {
  try {
    const token = await messaging.getToken({
      vapidKey: 'BAx...' // ضع مفتاح VAPID من إعدادات Firebase
    });
    console.log('✅ FCM Token:', token);
    
    // إرسال التوكن إلى الخادم
    await fetch('/api/notifications/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: localStorage.getItem('customerId') || localStorage.getItem('salonId'),
        fcmToken: token,
        userType: localStorage.getItem('customerToken') ? 'customer' : 'salon'
      })
    });
    
    return token;
  } catch (error) {
    console.error('❌ فشل الحصول على التوكن:', error);
  }
}

// ✅ استقبال الإشعارات في المقدمة
messaging.onMessage((payload) => {
  console.log('📩 إشعار أمامي:', payload);
  const { title, body } = payload.notification;
  // عرض إشعار مخصص في الواجهة
  showToast(`🔔 ${title}: ${body}`);
});

// عند تحميل الصفحة
if ('Notification' in window && Notification.permission === 'default') {
  requestNotificationPermission();
}
