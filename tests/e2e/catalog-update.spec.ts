import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('an invalid channel pointer leaves the working catalog and fit intact', async ({ page }) => {
  await page.route('**/updates/current.json', route => route.fulfill({ json: { formatVersion: 99 } }));
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: /Save fit|Save draft/ }).click();
  await page.getByText('Catalog version', { exact: true }).click();
  await page.getByRole('button', { name: 'Check catalog update' }).click();
  await expect(page.getByText('Malformed catalog channel pointer', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();
  await expect(page.getByLabel('Fit name')).toHaveValue('Rifter fit');
});

test('two tabs follow a same-build catalog update and rollback while their library survives', async ({ page, context }) => {
  const { createArtifacts } = await import('../../scripts/data/artifacts.ts');
  const { readSnapshot, sha256 } = await import('../../scripts/data/snapshot.ts');
  const source = await readSnapshot('20260101T000000Z', 'tests/fixtures/sde/baseline');
  source.tables.types.rows[0].typeID = 587;
  source.tables.types.rows[0].name = { en: 'Rifter' };
  source.tables.typeDogma.rows[0].typeID = 587;
  for (const table of [source.tables.types, source.tables.typeDogma]) table.sha256 = sha256(JSON.stringify(table.rows));
  const first = createArtifacts(source);
  const secondSource = structuredClone(source);
  secondSource.releaseId = '20260102T000000Z';
  secondSource.tables.typeDogma.rows[0].dogmaAttributes = [{ attributeID: 48, value: 132 }];
  secondSource.tables.typeDogma.sha256 = sha256(JSON.stringify(secondSource.tables.typeDogma.rows));
  const second = createArtifacts(secondSource);
  const releases = [first, second].map(value => {
    const bytes = Buffer.from(JSON.stringify(value.manifest));
    return {
      ...value, bytes, reference: { compatibilityId: value.manifest.compatibilityId,
        url: `/updates/releases/${value.manifest.compatibilityId}/manifest.json`, sha256: sha256(bytes) },
    };
  });
  let current = 0;
  let revision = 1;
  let failure: 'corrupt' | 'interrupted' | 'incompatible' | undefined = 'corrupt';
  const incompatible = Buffer.from(JSON.stringify({ ...first.manifest, engineRulesVersion: 'fixture-other-rules' }));
  await context.route('**/updates/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/updates/current.json') return route.fulfill({ json: {
      formatVersion: 1, revision, publishedAt: new Date().toISOString(),
      current: failure === 'incompatible' ? { ...releases[current].reference, sha256: sha256(incompatible) } : releases[current].reference,
    } });
    const release = releases.find(value => path === value.reference.url);
    if (release) return route.fulfill({ contentType: 'application/json', body: failure === 'incompatible' ? incompatible : release.bytes });
    const blob = path.replace('/updates/', '');
    const data = releases.flatMap(value => [...value.content]).find(([key]) => key === blob)?.[1];
    if (!data) return route.fulfill({ status: 404 });
    const index = blob === releases[current].manifest.files[0].url;
    if (failure === 'interrupted' && index) return route.abort('failed');
    return route.fulfill({ contentType: 'application/octet-stream',
      body: failure === 'corrupt' && index ? Buffer.alloc(data.length, 7) : data });
  });
  const openRelease = async (tab: typeof page) => {
    await tab.getByText('Catalog version', { exact: true }).click();
  };
  const update = async (tab: typeof page) => tab.getByRole('button', { name: 'Check catalog update' }).click();
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByLabel('Search equipment').fill('200mm AutoCannon II');
  await page.getByRole('button', { name: 'Add 200mm AutoCannon II', exact: true }).click();
  await page.getByRole('button', { name: 'Save fit', exact: true }).click();
  await openRelease(page);
  await update(page);
  await expect(page.getByText('Catalog artifact SHA-256 mismatch')).toBeVisible();
  failure = 'interrupted';
  await update(page);
  await expect(page.getByRole('button', { name: 'Check catalog update' })).toBeEnabled();
  await expect(page.getByRole('status')).toContainText('Catalog 20261120T165826Z ready');
  failure = 'incompatible';
  await update(page);
  await expect(page.getByText('Incompatible or malformed catalog manifest')).toBeVisible();
  failure = undefined;

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    const storageFault = window as Window & { restoreStorage?: () => void };
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'artifacts') throw new DOMException('Simulated storage quota', 'QuotaExceededError');
      return original.apply(this, args);
    };
    storageFault.restoreStorage = () => { IDBObjectStore.prototype.put = original; };
  });
  await update(page);
  await expect(page.getByText('Simulated storage quota')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Catalog 20261120T165826Z ready');
  await page.evaluate(() => (window as Window & { restoreStorage?: () => void }).restoreStorage?.());
  await update(page);
  await expect(page.getByRole('status')).toContainText('Catalog 20260101T000000Z ready');
  await expect(page.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();
  await expect(page.getByText('Unknown catalog type: 2889')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fitting results' })).toContainText('100 tf · partial');
  const other = await context.newPage();
  await other.goto('/');
  await expect(other.getByRole('status')).toContainText('Catalog 20260101T000000Z ready');
  await openRelease(other);
  current = 1;
  revision = 2;
  await Promise.all([update(page), update(other)]);
  await expect(page.getByRole('status')).toContainText('Catalog 20260102T000000Z ready');
  await expect(other.getByRole('status')).toContainText('Catalog 20260102T000000Z ready');
  await expect(other.getByRole('region', { name: 'Fitting results' })).toContainText('132 tf · partial');
  current = 0;
  revision = 3;
  await update(other);
  await expect(other.getByRole('status')).toContainText('Catalog 20260101T000000Z ready');
  await expect(other.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();
  await other.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('yaft');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('artifacts', 'readwrite');
      tx.objectStore('artifacts').clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  await other.reload();
  await expect(other.getByRole('status')).toContainText('Catalog 20261120T165826Z ready');
  await expect(other.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();
});
