import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname } from 'node:path';
import { expect, test } from '@playwright/test';

const base = process.env.YAFT_PAGES_BASE ?? '/yaft/';
const contentTypes: Record<string, string> = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname.startsWith(base)) {
    const relative = pathname.slice(base.length) + (pathname.endsWith('/') ? 'index.html' : '');
    try {
      const bytes = await readFile(`dist/${relative}`);
      response.setHeader('Content-Type', contentTypes[extname(relative)] ?? 'application/octet-stream');
      response.end(bytes);
      return;
    } catch {
      // Only deployed files have routes on the static host.
    }
  }
  response.writeHead(404).end();
});
let url: string;

test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address for the static test server');
  url = `http://127.0.0.1:${address.port}${base}`;
});

test.afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

test('the Pages build calculates and restores a local fit offline within its scope', async ({ page, context }) => {
  await page.goto(url);
  const catalog = await (await context.request.get(url + 'catalog/manifest.json')).json();
  await expect(page.getByRole('status')).toContainText(`Catalog ${catalog.sdeReleaseId} ready`);
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toBe(url);

  const manifestLink = page.locator('link[rel=manifest]');
  await expect(manifestLink).toHaveAttribute('href', base + 'manifest.webmanifest');
  const manifest = await (await context.request.get(url + 'manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ id: base, scope: base, start_url: base });
  for (const icon of manifest.icons) {
    expect(icon.src.startsWith(base + 'icons/')).toBe(true);
    expect((await context.request.get(new URL(icon.src, url).href)).ok()).toBe(true);
  }

  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Fitting results' }).getByText('All metrics', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save fit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();

  await page.getByText('Catalog version', { exact: true }).click();
  const channel = page.waitForResponse(url + 'updates/current.json');
  await page.getByRole('button', { name: /check.*update/i }).click();
  expect((await channel).status()).toBe(404);

  await context.setOffline(true);
  await page.close();
  const restored = await context.newPage();
  await restored.goto(url);
  await expect(restored.getByText('Offline · local workspace', { exact: true })).toBeVisible();
  await expect(restored.getByLabel('Fit name')).toHaveValue('Rifter fit');
});

test('a direct callback clears the query and returns to the project site', async ({ page }) => {
  const callback = url + 'auth/eve/callback/';
  expect((await page.goto(callback + '?code=mock-code&state=mock-state'))?.status()).toBe(200);
  await expect(page).toHaveURL(callback);
  await expect(page.getByRole('status')).toHaveText('Open sign-in again from this tab');
  await page.getByRole('link', { name: 'Return to fitting workspace' }).click();
  await expect(page).toHaveURL(url);
  await page.getByRole('link', { name: 'Licenses and source code' }).click();
  await expect(page.getByRole('link', { name: 'YAFT source code', exact: true })).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(page.getByRole('link', { name: 'Fitting engine source code' })).toHaveAttribute('href', /\/tree\/[a-f0-9]{40}$/);
});
