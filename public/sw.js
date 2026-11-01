/**
 * ══════════════════════════════════════════════════════════════════════════
 *  SERVICE WORKER — installability, without serving anyone a stale build
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️ THE FIRST VERSION OF THIS FILE CACHED NOTHING, AND THAT BROKE DESKTOP
 *     INSTALL. A user reported the install button appearing on Android and
 *     never on desktop. The cause: since Chrome 89 an app has to serve
 *     SOMETHING when the network is gone before Chrome will treat it as
 *     installable. A pure pass-through worker satisfies the letter of the
 *     criterion — there is a fetch handler — and fails the real one, silently,
 *     on one platform out of two.
 *
 *  ── WHAT IS CACHED, AND WHAT DELIBERATELY IS NOT ────────────────────────
 *
 *  Exactly one file: `offline.html`. Nothing else, ever.
 *
 *  The usual answer is an app-shell cache, and it is the wrong one here. This
 *  project is judged from a live URL until 31 August. A cached shell means
 *  someone who opened it once can be served a build from before a fix, see a
 *  bug we already corrected, and have no way to tell — which for THIS product
 *  is worse than usual, because its whole claim is that you can trust what it
 *  shows you.
 *
 *  So: every real request goes to the network, every time. When the network is
 *  genuinely gone, a navigation gets an honest page that says so, instead of a
 *  stale screen that looks like it still works.
 */

const CACHE = 'kroma-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload` bypasses the HTTP cache, so a fixed offline page is picked up
      // rather than whatever the browser happened to be holding.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // Take over immediately rather than waiting for every tab to close, so a
      // fixed version reaches the user on the next load instead of the next day.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop anything a previous version of this file cached.
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  /**
   * ⚠️ ONLY NAVIGATIONS GET THE FALLBACK. An API call that fails offline must
   *    keep failing: the routes report errors the UI already knows how to
   *    render, and handing them an HTML page instead would turn a clear "no
   *    connection" into a JSON parse error nobody can act on.
   */
  if (request.mode !== 'navigate') return;

  event.respondWith(
    (async () => {
      try {
        // Network first, always. Never a cached copy of a real screen.
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return (
          offline ??
          new Response('KROMA is offline.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        );
      }
    })(),
  );
});
