const CACHE_NAME = 'halakati-v1';

// ✅ قائمة الملفات المطلوب تخزينها (تأكد من وجودها)
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

// ✅ تثبيت Service Worker
self.addEventListener('install', event => {
    console.log('✅ تثبيت Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ تم فتح الكاش');
                // ✅ محاولة تخزين الملفات مع تجاهل الأخطاء
                return cache.addAll(urlsToCache).catch(err => {
                    console.warn('⚠️ بعض الملفات غير موجودة، يتم تجاهلها:', err);
                    // ✅ محاولة تخزين الملفات الموجودة فقط
                    return Promise.all(
                        urlsToCache.map(url => {
                            return cache.add(url).catch(() => {
                                console.warn(`⚠️ لا يمكن تخزين: ${url}`);
                            });
                        })
                    );
                });
            })
            .then(() => {
                console.log('✅ تم التخزين المؤقت بنجاح');
            })
            .catch(err => {
                console.error('❌ فشل التخزين المؤقت:', err);
            })
    );
});

// ✅ تفعيل Service Worker
self.addEventListener('activate', event => {
    console.log('✅ تفعيل Service Worker...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log(`🗑️ حذف الكاش القديم: ${cacheName}`);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});

// ✅ اعتراض الطلبات والرد من الكاش
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // ✅ إذا وجد في الكاش، أعد من الكاش
                if (response) {
                    return response;
                }
                // ✅ وإلا، أرسل طلباً إلى الشبكة
                return fetch(event.request).catch(() => {
                    // ✅ في حالة فشل الشبكة، أعد صفحة الخطأ
                    return new Response('⚠️ غير متصل بالإنترنت', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});
