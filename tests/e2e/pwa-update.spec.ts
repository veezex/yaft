import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const legacyPage = '<h1>Legacy YAFT</h1><script>navigator.serviceWorker.register("/sw.js")</script>';
const legacyWorker = `
self.addEventListener('install', event => {
  event.waitUntil(caches.open('yaft-shell-legacy-test').then(cache => cache.add('/')));
});
self.addEventListener('activate', event => event.waitUntil(clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') event.respondWith(caches.match('/'));
});
`;

test('a cached legacy shell updates while its original tab stays open', async ({ page, context }) => {
  let onlineBuild = false;
  const shell: { files: string[] } = JSON.parse(await readFile('dist/shell-manifest.json', 'utf8'));
  const servedFiles = new Set([...shell.files, '/sw.js', '/shell-manifest.json']);
  const media: Record<string, string> = {
    html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png',
    blob: 'application/octet-stream', json: 'application/json', webmanifest: 'application/manifest+json',
  };
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (!onlineBuild && (pathname === '/' || pathname === '/sw.js')) {
      response.setHeader('Content-Type', pathname === '/' ? 'text/html' : 'text/javascript');
      response.end(pathname === '/' ? legacyPage : legacyWorker);
      return;
    }
    const path = pathname === '/' ? '/index.html' : pathname;
    if (!servedFiles.has(path) && !/^\/catalog\/(?:bootstrap\.json|manifest\.json|blobs\/[a-f0-9]+\.blob)$/.test(path)) {
      response.writeHead(404).end();
      return;
    }
    void readFile('dist' + path).then(bytes => {
      response.setHeader('Content-Type', media[path.split('.').at(-1) ?? ''] ?? 'application/octet-stream');
      response.setHeader('Cache-Control', 'no-store');
      response.end(bytes);
    }).catch(() => response.writeHead(404).end());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No local address for update test');
    const origin = `http://127.0.0.1:${address.port}`;
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.evaluate(() => {
      const old = navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (navigator.serviceWorker.controller !== old) document.body.dataset.shellUpdated = 'true';
      });
    });

    onlineBuild = true;
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();
    });
    await expect(page.locator('body')).toHaveAttribute('data-shell-updated', 'true');
    await expect(page.getByRole('heading', { name: 'Legacy YAFT' })).toBeVisible();

    const fresh = await context.newPage();
    await fresh.goto(origin);
    await expect(fresh.getByRole('heading', { name: 'YAFT', exact: true })).toBeVisible();
    await expect(fresh.getByText('Offline ready', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await fresh.reload();
    await expect(fresh.getByText('Offline · local workspace', { exact: true })).toBeVisible();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
