/* Service worker for Sudoku de poche.
   Lives in public/ so its URL stays unhashed: a service worker and its scope
   are identified by path, and a hashed name would orphan the installed one. */

const CACHE = 'sdp-v1';

// ponytail: runtime caching, no install-time precache. The shell caches itself
// on the first (online by definition) visit. If a user must be able to install
// online and play offline without a second load, precache the build here.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/** Store a response only if it is one worth replaying. Opaque and error responses are not. */
async function put(request, response) {
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Network first: a new deploy is picked up as soon as the network allows. */
async function fresh(request) {
  try {
    return await put(request, await fetch(request));
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

/** Cache first: safe because Vite hashes every asset filename. */
async function cached(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  return put(request, await fetch(request));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // The two HTML entries are the only documents; everything else is hashed.
  event.respondWith(request.mode === 'navigate' ? fresh(request) : cached(request));
});
