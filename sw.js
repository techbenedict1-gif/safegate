/* SafeGate service worker: app shell works offline. API calls are never cached. */
const VERSION = 'sg-v39';
const TILES = 'sg-tiles';   // map pictures people have seen or saved for offline use. Kept across updates.
const TILE_MAX = 900;
const SHELL = ['./', 'index.html', 'desk.html', 'start.html', 'privacy.html', 'css/app.css', 'js/core.js', 'js/ui.js', 'js/native.js', 'js/feedback.js', 'js/media.js', 'js/student.js', 'js/slides.js', 'js/map.js', 'js/desk.js', 'js/qrscan.js', 'lib/qrcode.js',
  'manifest.webmanifest', 'desk.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'SafeGate', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'SafeGate', {
    body: d.body || '', tag: d.tag || 'sg', renotify: !!d.urgent, requireInteraction: !!d.require, icon: 'icon-192.png', badge: 'icon-192.png',
    vibrate: d.urgent ? [250, 100, 250, 100, 250] : [120], data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.replace(/[?#].*$/, '').replace(/\/+$/, '') === url.replace(/\/+$/, '') && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method === 'GET' && url.origin !== location.origin && req.destination === 'image' && /\/\d{1,2}\/\d+\/\d+(\.(png|jpe?g|webp|pbf))?$/i.test(url.pathname)) {
    e.respondWith(caches.open(TILES).then((c) => c.match(req).then((hit) => hit || fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' })).catch(() => fetch(req)).then((res) => {   // CORS first: a real-size copy, not a padded opaque one. Falls back for providers without CORS.
      if (res.ok || res.type === 'opaque') { c.put(req, res.clone()).then(() => c.keys()).then((ks) => { if (ks.length > TILE_MAX) return Promise.all(ks.slice(0, ks.length - TILE_MAX).map((k) => c.delete(k))); }).catch(() => {}); }
      return res;
    }))));
    return;
  }
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    const pth = url.pathname.replace(/\/+$/, '');
    if (!(pth === '' || pth === '/index.html' || pth === '/desk' || pth === '/desk.html')) return;   // family link, install page, operator: never stored as the student or desk page
    const page = url.pathname.replace(/\/+$/, '').endsWith('desk') || url.pathname.endsWith('desk.html') ? 'desk.html' : 'index.html';
    e.respondWith(
      fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(page, copy)); } return res; })
        .catch(() => caches.match(page).then((r) => r || caches.match('index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
