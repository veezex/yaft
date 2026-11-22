declare const YAFT_SHELL_VERSION: string;
declare const YAFT_SHELL_FILES: string[];

const serviceWorker = self as unknown as ServiceWorkerGlobalScope;
const base = new URL(serviceWorker.registration.scope).pathname;
const index = base + 'index.html';
const assets = base + 'assets/';
const shellCache = `yaft-shell-${YAFT_SHELL_VERSION}`;
const resources = new Set(YAFT_SHELL_FILES);

serviceWorker.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    try {
      await cache.addAll(YAFT_SHELL_FILES.map(path => new Request(path, { cache: 'reload' })));
    } catch (error) {
      await caches.delete(shellCache);
      throw error;
    }
    // Existing tabs keep their code and can still request assets from earlier shell caches.
    await serviceWorker.skipWaiting();
  })());
});

serviceWorker.addEventListener('activate', event => {
  event.waitUntil(serviceWorker.clients.claim());
});

serviceWorker.addEventListener('message', event => {
  if (event.data === 'YAFT_SHELL_STATUS' || event.data?.type === 'YAFT_SHELL_STATUS') {
    event.waitUntil(caches.open(shellCache).then(async cache => {
      const complete = (await Promise.all(YAFT_SHELL_FILES.map(path => cache.match(path)))).every(Boolean);
      const entry = event.data?.entry;
      const matches = typeof entry !== 'string' || resources.has(entry);
      event.ports[0]?.postMessage({ type: 'YAFT_SHELL_STATUS', ready: complete && matches, version: YAFT_SHELL_VERSION });
    }));
  }
});

async function navigate(request: Request): Promise<Response> {
  const cache = await caches.open(shellCache);
  try {
    const response = await fetch(request, { cache: 'no-cache', signal: AbortSignal.timeout(4000) });
    return response.ok ? response : (await cache.match(index)) ?? response;
  } catch (error) {
    const offline = await cache.match(index);
    if (offline) return offline;
    throw error;
  }
}

serviceWorker.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== serviceWorker.location.origin) return;
  if (request.mode === 'navigate' && (url.pathname === base || url.pathname === index)) {
    event.respondWith(navigate(request));
    return;
  }
  const isAsset = url.pathname.startsWith(assets);
  if (resources.has(url.pathname) || isAsset) {
    event.respondWith(caches.open(shellCache).then(cache => cache.match(url.pathname, { ignoreVary: true }))
      .then(async response => response ?? (isAsset ? await caches.match(url.pathname, { ignoreVary: true }) : undefined) ?? fetch(request)));
  }
});
