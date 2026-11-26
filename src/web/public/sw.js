/*
 * ZapBot web: the service worker of the installable page.
 *  - push: the notices of the bot (src/webPush.js) as notifications; a click opens (or focuses) the page there
 *  - offline: the page itself and the notes the server marked X-Offline (never a protected tag) answer from the cache
 *    when the network fails; online, everything comes from the network first (a deploy shows at once)
 */
const SHELL = 'zb-shell-v1';
const DATA = 'zb-data';
const SHELL_FILES = ['/', '/app.js', '/style.css', '/manifest.webmanifest', '/icon.svg', '/icon-192.png'];
const OFFLINE_DATA = /^\/api\/(?:session|notes\/tags|notes|notes\/media)$/;

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('zb-shell-') && k !== SHELL).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

async function networkFirst(request, cacheName, keep) {
    try {
        const response = await fetch(request);
        if (response.ok && keep(response)) (await caches.open(cacheName)).put(request, response.clone());
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        throw err;
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (request.mode === 'navigate' || SHELL_FILES.includes(url.pathname)) {
        event.respondWith(networkFirst(request, SHELL, () => true).catch(() => caches.match('/')));
    } else if (OFFLINE_DATA.test(url.pathname)) {
        // The session only says whether you are logged in (no data); the notes only when the server allows it
        event.respondWith(networkFirst(request, DATA, r => url.pathname === '/api/session' || r.headers.get('X-Offline') === '1'));
    }
});

// The logout (or a login of someone else) forgets what was kept
self.addEventListener('message', (event) => {
    if (event.data?.type === 'forget') event.waitUntil(caches.delete(DATA));
});

self.addEventListener('push', (event) => {
    let notice;
    try {
        notice = event.data?.json() ?? {};
    } catch {
        notice = { title: 'ZapBot', body: event.data?.text() ?? '' };
    }
    event.waitUntil(self.registration.showNotification(notice.title || 'ZapBot', {
        body: notice.body || '', tag: notice.tag || notice.kind || 'zapbot', renotify: true,
        icon: '/icon-192.png', badge: '/icon-192.png', timestamp: notice.at || Date.now(),
        requireInteraction: Boolean(notice.urgent), data: { url: notice.url || '/' }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
    event.waitUntil((async () => {
        const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const page = open.find(c => new URL(c.url).origin === self.location.origin);
        if (page) {
            await page.focus();
            page.postMessage({ type: 'open', url: target });
            return;
        }
        await self.clients.openWindow(target);
    })());
});
