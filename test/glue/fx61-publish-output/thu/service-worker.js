// Link /thu/ đã bỏ (19/11/2026): gỡ service worker cũ ở phạm vi này và chuyển các tab về link chính.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(new URL('../', self.registration.scope).href);
})()));
