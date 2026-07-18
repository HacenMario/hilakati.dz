importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBvVft2tK7uCW2lK1BzFfJEqcfi2BfRKIY",
  authDomain: "hilakatidz.firebaseapp.com",
  projectId: "hilakatidz",
  storageBucket: "hilakatidz.firebasestorage.app",
  messagingSenderId: "254055907785",
  appId: "1:254055907785:web:c3d2164dcc8cc110aa2818",
  measurementId: "G-5H5C0Q83H1"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('📩 إشعار خلفية:', payload);
  const { title, body } = payload.notification;
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    data: payload.data || {}
  });
});
