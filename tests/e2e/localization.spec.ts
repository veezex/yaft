import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { CompatibilityRelease } from '../../src/storage/catalog-contract.ts';
import { sha256 } from '../../scripts/data/snapshot.ts';

test.describe('browser language', () => {
  test.use({ locale: 'ru-RU' });

  test('selects Russian automatically and remembers a manual override', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'ru');
    await expect(page).toHaveTitle('YAFT | Редактор фитов EVE');
    await expect(page.getByRole('combobox', { name: 'Язык', exact: true })).toHaveValue('auto');

    await page.getByRole('combobox', { name: 'Язык', exact: true }).selectOption('en');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('YAFT | EVE fitting workspace');
    await page.reload();
    const language = page.getByRole('combobox', { name: 'Language', exact: true });
    await expect(language).toHaveValue('en');

    await language.selectOption('auto');
    await expect(html).toHaveAttribute('lang', 'ru');
    await page.reload();
    await expect(page.getByRole('combobox', { name: 'Язык', exact: true })).toHaveValue('auto');
  });
});

test.describe('unsupported browser language', () => {
  test.use({ locale: 'fr-FR' });

  test('falls back to English and follows supported languages in preference order', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('auto');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'languages', { configurable: true, value: ['fr-FR', 'ru-KZ', 'en-GB'] });
      window.dispatchEvent(new Event('languagechange'));
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'languages', { configurable: true, value: ['en-GB', 'ru-KZ'] });
      window.dispatchEvent(new Event('languagechange'));
    });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test('switching languages preserves the open draft, calculations and catalog inspection', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (data, options) {
      if (data.kind === 'calculate') {
        const { dataset } = document.documentElement;
        dataset.calculations = String(Number(dataset.calculations ?? 0) + 1);
      }
      return Reflect.apply(post, this, [data, options]);
    };
  });
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByLabel('Fit name', { exact: true }).fill('Local draft');
  await page.getByRole('combobox', { name: 'Skill profile', exact: true }).selectOption('all-zero');
  const englishWarnings = page.getByRole('region', { name: 'Fit warnings' });
  await expect(englishWarnings).toContainText('Rifter requires Minmatar Frigate level 1');
  await page.getByText('All metrics', { exact: true }).click();
  const powerCapacity = page.locator('.metric-list > div').filter({ hasText: 'Powergrid capacity' });
  await expect(powerCapacity.locator('dd')).toHaveText('41 MW');

  const search = page.getByLabel('Search equipment');
  await search.fill('200mm AutoCannon II');
  const item = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Add 200mm AutoCannon II', exact: true }) });
  await item.getByRole('button', { name: 'Attributes for 200mm AutoCannon II' }).click();
  await expect(item.getByText('Powergrid Usage', { exact: true })).toBeVisible();
  const before = await page.locator('html').getAttribute('data-calculations');

  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ru');
  await expect(page.getByLabel('Название фита', { exact: true })).toHaveValue('Local draft');
  await expect(page.getByLabel('Поиск оборудования')).toHaveValue('200mm AutoCannon II');
  const russianItem = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Добавить 200mm AutoCannon II', exact: true }) });
  await expect(russianItem.getByText('Баллистическое орудие', { exact: true })).toBeVisible();
  const powerRow = russianItem.locator('dl > div').filter({ hasText: 'Использование энергосети' });
  await expect(powerRow.locator('dd')).toHaveText('4 МВт');
  await expect(page.locator('.metric-list > div').filter({ hasText: 'Мощность энергосети' }).locator('dd')).toHaveText('41 МВт');
  await expect(page.getByRole('region', { name: 'Предупреждения фита' })).toContainText('Rifter: требуется навык «Минматарские фрегаты» уровня 1');
  await expect(page.locator('.hull-heading')).toContainText('Фрегат');
  await expect(page.locator('html')).toHaveAttribute('data-calculations', before!);

  await page.getByRole('button', { name: 'Копировать профиль' }).click();
  const skills = page.getByLabel('Поиск навыков');
  for (const query of ['Управление ускорителями', 'Acceleration Control', '3452']) {
    await skills.fill(query);
    await expect(page.getByRole('combobox', { name: 'Управление ускорителями', exact: true })).toBeVisible();
  }
  await page.getByRole('combobox', { name: 'Язык', exact: true }).selectOption('en');
  await expect(page.getByRole('combobox', { name: 'Acceleration Control', exact: true })).toBeVisible();
  await expect(page.getByLabel('Fit name', { exact: true })).toHaveValue('Local draft');
  await expect(englishWarnings).toContainText('Rifter requires Minmatar Frigate level 1');
  await expect(page.locator('html')).toHaveAttribute('data-calculations', before!);
});

test('uses English names where CCP has no Russian entry and can switch offline at 360 px', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await page.goto('/');
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ru');
  await page.reload();
  await expect(page.getByText('Офлайн · локальная работа', { exact: true })).toBeVisible();
  await page.getByLabel('Поиск корпусов').fill('97793');
  await expect(page.getByRole('button', { name: 'Herald', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.getByRole('combobox', { name: 'Язык', exact: true }).selectOption('en');
  await expect(page.getByLabel('Search hulls')).toHaveValue('97793');
});

test.describe('installed catalog', () => {
  test.use({ serviceWorkers: 'block' });

  test('upgrades a copy of the same catalog after reconnection and keeps the draft', async ({ page, context }) => {
    const root = 'public/catalog/';
    const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8')) as CompatibilityRelease;
    const dogma = manifest.files.find(file => file.purpose === 'dogma')!;
    const dogmaData = JSON.parse(gunzipSync(readFileSync(root + dogma.url)).toString('utf8'));
    delete dogmaData.localizedLabels;
    const legacyBlob = gzipSync(JSON.stringify(dogmaData));
    const legacyHash = sha256(legacyBlob);
    const legacyBlobPath = `blobs/${legacyHash}.blob`;
    const legacyManifest = {
      ...manifest, compatibilityId: `${manifest.sdeReleaseId}-legacy`, localizedLabelsVersion: undefined,
      files: manifest.files.map(file => file === dogma ?
        { ...file, url: legacyBlobPath, bytes: legacyBlob.length, sha256: legacyHash } : file),
    };
    const legacyManifestBytes = Buffer.from(JSON.stringify(legacyManifest));
    let legacy = true;
    await page.route('**/catalog/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (legacy && path === '/catalog/bootstrap.json') return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, json: {
        compatibilityId: legacyManifest.compatibilityId, url: '/catalog/manifest.json', sha256: sha256(legacyManifestBytes),
      } });
      if (legacy && path === '/catalog/manifest.json') return route.fulfill({ headers: { 'Cache-Control': 'no-store' }, body: legacyManifestBytes });
      if (path === '/catalog/' + legacyBlobPath) return route.fulfill({ body: legacyBlob });
      return route.continue();
    });

    await page.goto('/');
    await expect(page.getByLabel('Search hulls')).toBeEnabled();
    await context.setOffline(true);
    await expect(page.getByText('Offline · local workspace', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Language', exact: true }).selectOption('ru');
    await page.getByLabel('Поиск корпусов').fill('Rifter');
    await page.getByRole('button', { name: 'Rifter', exact: true }).click();
    await page.getByLabel('Название фита', { exact: true }).fill('Local draft');
    await expect(page.locator('.hull-heading')).toContainText('Frigate');

    legacy = false;
    await context.setOffline(false);
    await expect(page.locator('.hull-heading')).toContainText('Фрегат');
    await expect(page.getByLabel('Название фита', { exact: true })).toHaveValue('Local draft');
  });
});
