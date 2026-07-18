import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

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

// ✅ استخدم المفتاح العام هنا
const VAPID_KEY = "BNkIuGv3eNZ4GVRc4M7l7UtOdOz6Uw0c3wXazo9g8JxDPOnw3eUt9o-A5djfc2UwxG_b89LDWkeND0TyhKNc-s0";

export async function requestPermissionAndGetToken() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("❌ الإذن مرفوض");
      return null;
    }

    // ✅ تمرير المفتاح هنا
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    console.log("✅ توكن الجهاز:", token);
    return token;
  } catch (error) {
    console.error("❌ فشل الحصول على التوكن:", error);
    return null;
  }
}

export function onForegroundMessage(callback) {
  onMessage(messaging, (payload) => {
    console.log("📨 إشعار ورد:", payload);
    callback(payload);
  });
}
