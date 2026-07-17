// ============================================================
// ✅ إصدار التطبيق (يتغير تلقائياً عند كل تحديث)
// ============================================================
const APP_VERSION = new Date().getTime();
const CACHE_NAME = `halakati-${APP_VERSION}`;

// ✅ قائمة الملفات المطلوب تخزينها
const urlsToCache = [
    '/',
    '/index.html',
    '/manifest.json'
];

// ============================================================
// ✅ تثبيت Service Worker (بدون addAll لتجنب الأخطاء)
// ============================================================
self.addEventListener('install', event => {
    console.log(`✅ تثبيت Service Worker (${CACHE_NAME})...`);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('✅ تم فتح الكاش');
                // ✅ تخزين كل ملف على حدة (تجنباً لخطأ addAll)
                return Promise.all(
                    urlsToCache.map(url => {
                        return cache.add(url).catch(() => {
                            console.warn(`⚠️ لا يمكن تخزين: ${url}`);
                        });
                    })
                );
            })
            .then(() => {
                console.log('✅ تم التخزين المؤقت بنجاح');
                return self.skipWaiting();
            })
            .catch(err => {
                console.error('❌ فشل التخزين المؤقت:', err);
            })
    );
});

// ============================================================
// ✅ تفعيل Service Worker وحذف الكاش القديم
// ============================================================
self.addEventListener('activate', event => {
    console.log(`✅ تفعيل Service Worker (${CACHE_NAME})...`);
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
        .then(() => {
            return self.clients.claim();
        })
    );
});

// ============================================================
// ✅ اعتراض الطلبات والرد من الكاش
// ============================================================
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request).catch(() => {
                    return new Response('⚠️ غير متصل بالإنترنت', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});
