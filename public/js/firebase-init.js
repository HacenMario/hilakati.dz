// firebase-init.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// تكوين Firebase (استخدم المتغيرات البيئية إن أمكن)
const firebaseConfig = {
  apiKey: "AIzaSyBvVft2tK7uCW2lK1BzFfJEqcfi2BfRKIY",
  authDomain: "hilakatidz.firebaseapp.com",
  projectId: "hilakatidz",
  storageBucket: "hilakatidz.firebasestorage.app",
  messagingSenderId: "254055907785",
  appId: "1:254055907785:web:c3d2164dcc8cc110aa2818",
  measurementId: "G-5H5C0Q83H1"
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// دالة لطلب الإذن والحصول على التوكن
export async function requestPermissionAndGetToken() {
  try {
    // طلب الإذن
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("❌ الإذن مرفوض");
      return null;
    }

    // الحصول على التوكن (VAPID key مطلوب)
    // ستحتاج إلى إضافة VAPID key من Firebase Console > Project Settings > Cloud Messaging
    const token = await getToken(messaging, {
      vapidKey: "YOUR_VAPID_KEY" // استبدل بالمفتاح العام
    });

    console.log("✅ توكن الجهاز:", token);
    return token;
  } catch (error) {
    console.error("❌ فشل الحصول على التوكن:", error);
    return null;
  }
}

// استماع للإشعارات أثناء فتح التطبيق (foreground)
export function onForegroundMessage(callback) {
  onMessage(messaging, (payload) => {
    console.log("📨 إشعار ورد أثناء التطبيق مفتوح:", payload);
    callback(payload);
  });
}
