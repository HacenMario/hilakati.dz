// ============================================================
// Service Worker للتطبيق - يدعم الإشعارات
// ============================================================

const CACHE_NAME = 'halakati-v1';

// ✅ تثبيت Service Worker (بدون تخزين ملفات)
self.addEventListener('install', (event) => {
    console.log('📦 Service Worker: تثبيت');
    // ✅ تخطي مرحلة الانتظار
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
    // ✅ السيطرة على جميع الصفحات فوراً
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

    const options = {
        body: data.body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
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
                for (const client of clientList) {
                    if (client.url.includes(url) && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) {
                    return clients.openWindow(url);
                }
            })
    );
});
