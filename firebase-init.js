// public/js/firebase-init.js
import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// تكوين Firebase (بيانات المشروع)
const firebaseConfig = {
  apiKey: "AIzaSyBvVft2tK7uCW2lK1BzFfJEqcfi2BfRKIY",
  authDomain: "hilakatidz.firebaseapp.com",
  projectId: "hilakatidz",
  storageBucket: "hilakatidz.firebasestorage.app",
  messagingSenderId: "254055907785",
  appId: "1:254055907785:web:c3d2164dcc8cc110aa2818",
  measurementId: "G-5H5C0Q83H1"
};

// مفتاح VAPID العام (من Firebase Console > Project Settings > Cloud Messaging)
const VAPID_KEY = "BNkIuGv3eNZ4GVRc4M7l7UtOdOz6Uw0c3wXazo9g8JxDPOnw3eUt9o-A5djfc2UwxG_b89LDWkeND0TyhKNc-s0";

// تهيئة تطبيق Firebase
const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

/**
 * طلب إذن الإشعارات والحصول على توكن الجهاز
 * @returns {Promise<string|null>} - التوكن أو null في حالة الفشل
 */
export async function requestPermissionAndGetToken() {
  try {
    // 1. طلب إذن الإشعارات من المستخدم
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("❌ لم يتم منح إذن الإشعارات");
      return null;
    }

    // 2. الحصول على التوكن باستخدام مفتاح VAPID
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    console.log("✅ توكن الجهاز:", token);
    return token;
  } catch (error) {
    console.error("❌ فشل الحصول على التوكن:", error);
    return null;
  }
}

/**
 * الاستماع للإشعارات الواردة أثناء فتح التطبيق (foreground)
 * @param {Function} callback - دالة تستدعى عند وصول إشعار
 */
export function onForegroundMessage(callback) {
  onMessage(messaging, (payload) => {
    console.log("📨 إشعار ورد أثناء التطبيق مفتوح:", payload);
    // تمرير البيانات إلى الدالة التي يقدمها المستخدم
    callback(payload);
  });
}

/**
 * التحقق مما إذا كان المتصفح يدعم الإشعارات
 * @returns {boolean}
 */
export function isNotificationSupported() {
  return (
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

/**
 * تسجيل Service Worker الخاص بـ Firebase (اختياري - يُستدعى مرة واحدة)
 */
export async function registerServiceWorker() {
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      console.log("✅ Service Worker مسجل:", registration);
      return registration;
    } else {
      console.warn("⚠️ Service Worker غير مدعوم");
      return null;
    }
  } catch (error) {
    console.error("❌ فشل تسجيل Service Worker:", error);
    return null;
  }
}

// تصدير كائن messaging للاستخدام المباشر إذا دعت الحاجة
export { messaging };
