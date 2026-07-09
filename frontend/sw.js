// sw.js - Service Worker للتطبيق
const CACHE_NAME = 'halakati-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  // يمكنك إضافة ملفات CSS أو JS إضافية هنا
];

// تثبيت الـ Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ تم فتح الكاش');
        return cache.addAll(urlsToCache);
      })
  );
});

// تفعيل الـ Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
});

// اعتراض الطلبات وتقديم نسخة من الكاش
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // إذا وجدت نسخة في الكاش، استخدمها، وإلا احصل من الشبكة
        return response || fetch(event.request).catch(() => {
          // إذا فشلت الشبكة، عرض صفحة خطأ بسيطة
          return new Response('⚠️ لا يوجد اتصال بالإنترنت', { status: 503 });
        });
      })
  );
});
