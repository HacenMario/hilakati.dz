// ============================================================
// ✅ إصدار التطبيق (يتغير تلقائياً عند كل تحديث)
// ============================================================
const APP_VERSION = new Date().getTime();
// ============================================================
// Service Worker للتطبيق - يدعم الإشعارات
// ============================================================

const CACHE_NAME = 'halakati-v1';

// ✅ تثبيت Service Worker
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker: تثبيت');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/index.html',
                '/manifest.json'
            ]);
        })
    );
    self.skipWaiting();
});

// ✅ تفعيل Service Worker
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker: تفعيل');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ✅ استقبال إشعارات Push
self.addEventListener('push', (event) => {
    console.log('🔔 Push Notification Received:', event);

    let data = {
        title: '🔔 حلاقتي',
        body: 'لديك إشعار جديد',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        data: {
            url: '/',
            notificationId: Date.now()
        }
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    // ✅ عرض الإشعار
    const options = {
        body: data.body,
        icon: data.icon || '/icons/icon-192.png',
        badge: data.badge || '/icons/icon-72.png',
        data: data.data || { url: '/' },
        vibrate: [200, 100, 200],
        actions: [
            {
                action: 'open',
                title: '📱 فتح التطبيق'
            },
            {
                action: 'close',
                title: '✖ إغلاق'
            }
        ],
        requireInteraction: true
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ✅ النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notification Clicked:', event);

    event.notification.close();

    const url = event.notification.data?.url || '/';
    const action = event.action;

    if (action === 'close') {
        return;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // ✅ إذا كان هناك نافذة مفتوحة، انتقل إليها
                for (const client of clientList) {
                    if (client.url.includes(url) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // ✅ وإلا افتح نافذة جديدة
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});
