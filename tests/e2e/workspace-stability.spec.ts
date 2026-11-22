import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

declare global {
  interface Window {
    workspaceTest: {
      delay: number;
      calculations: number;
      draws: number;
      shifts: { value: number; elements: string[] }[];
      observing: boolean;
    };
  }
}

async function trackWork(page: Page) {
  await page.addInitScript(() => {
    const state = window.workspaceTest = { delay: 0, calculations: 0, draws: 0, shifts: [] as Window['workspaceTest']['shifts'], observing: false };
    if (PerformanceObserver.supportedEntryTypes?.includes('layout-shift')) {
      new PerformanceObserver(list => {
        if (!state.observing) return;
        for (const entry of list.getEntries() as (PerformanceEntry & {
          value: number; hadRecentInput: boolean; sources: { node: Node | null }[];
        })[]) {
          if (entry.hadRecentInput) continue;
          state.shifts.push({ value: entry.value, elements: entry.sources.map(({ node }) => {
            const element = node instanceof Element ? node : node?.parentElement;
            return element ? `${element.tagName}.${element.className} ${element.textContent?.slice(0, 80)}` : '';
          }) });
        }
      }).observe({ type: 'layout-shift' });
    }
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (data, options) {
      if (data.kind === 'calculate') state.calculations++;
      if (state.delay && ['calculate', 'search'].includes(data.kind)) {
        setTimeout(() => Reflect.apply(post, this, [data, options]), state.delay);
      } else Reflect.apply(post, this, [data, options]);
    };
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.closest('.graphs')) state.draws++;
      return clear.apply(this, args);
    };
  });
  await page.goto('/');
}

function rectangle(locator: Locator) {
  return locator.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return [x + scrollX, y + scrollY, width, height];
  });
}

async function expectStable(locator: Locator, original: number[]) {
  const next = await rectangle(locator);
  next.forEach((coordinate, i) => expect(Math.abs(coordinate - original[i])).toBeLessThanOrEqual(1));
}

const library = (page: Page) => page.getByRole('region', { name: 'Local library' });
const catalog = (page: Page) => page.getByRole('region', { name: 'Catalog', exact: true });
const stats = (page: Page) => page.getByRole('region', { name: 'Fitting results' });

async function awaitPaint(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('catalog and fitting switches preserve geometry and keep the previous results during worker latency', async ({ page }) => {
  await trackWork(page);
  const search = page.getByLabel('Search hulls');
  await search.fill('Confessor');
  await page.getByRole('button', { name: 'Confessor', exact: true }).click();
  await page.getByLabel('Search equipment').fill('Small Focused Pulse Laser II');
  await page.getByRole('button', { name: 'Add Small Focused Pulse Laser II', exact: true }).click();
  const gun = page.locator('.fitted-item').filter({ hasText: 'Small Focused Pulse Laser II' });
  await expect(gun.getByRole('button', { name: 'Choose charge' })).toBeVisible();
  const searchField = catalog(page).getByRole('searchbox');
  const list = catalog(page).getByRole('list');
  await expect(list).toHaveAttribute('aria-busy', 'false');
  await expect(stats(page)).toHaveAttribute('aria-busy', 'false');

  const libraryBox = await rectangle(library(page));
  const listBox = await rectangle(list);
  const searchBox = await rectangle(searchField);
  const resultsBox = await rectangle(stats(page).locator('.stat-grid'));
  await awaitPaint(page);
  await page.evaluate(() => { Object.assign(window.workspaceTest, { delay: 620, observing: true }); });

  await catalog(page).getByRole('button', { name: 'Hulls', exact: true }).click();
  await expect(list).toHaveAttribute('aria-busy', 'true');
  await expect(list.getByRole('button', { name: 'Add Small Focused Pulse Laser II', exact: true })).toBeDisabled();
  await expectStable(list, listBox);
  await expectStable(searchField, searchBox);
  await expect(list).toHaveAttribute('aria-busy', 'false');
  await catalog(page).getByRole('button', { name: 'Equipment', exact: true }).click();
  await catalog(page).getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Modules' });
  await expect(list).toHaveAttribute('aria-busy', 'false');
  await expectStable(list, listBox);

  await page.getByRole('combobox', { name: 'Hull mode', exact: true }).selectOption({ label: 'Confessor Propulsion Mode' });
  await expect(stats(page)).toHaveAttribute('aria-busy', 'true');
  await expectStable(stats(page).locator('.stat-grid'), resultsBox);
  await expect(stats(page)).toHaveAttribute('aria-busy', 'false');
  await page.getByLabel('Skill profile').selectOption('all-zero');
  await expect(stats(page)).toHaveAttribute('aria-busy', 'false');
  await gun.getByLabel('State of Small Focused Pulse Laser II').selectOption('active');
  await expect(stats(page)).toHaveAttribute('aria-busy', 'false');

  await gun.getByRole('button', { name: 'Choose charge' }).click();
  await expect(list).toHaveAttribute('aria-busy', 'false');
  await expectStable(list, listBox);
  await expectStable(searchField, searchBox);
  await expectStable(stats(page).locator('.stat-grid'), resultsBox);
  await expectStable(library(page), libraryBox);
  await awaitPaint(page);
  expect(await page.evaluate(() => window.workspaceTest.shifts)).toEqual([]);
});

test('mobile tab starts from the same geometry and preserves catalog scroll and editor state', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await trackWork(page);
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  const tabs = page.getByRole('navigation', { name: 'Workspace' });
  await expect(page.getByLabel('Fit name')).toHaveValue('Rifter fit');
  const libraryBox = await rectangle(library(page));
  await tabs.getByRole('button', { name: 'Catalog' }).click();
  const list = catalog(page).getByRole('list');
  await expect(list).toHaveAttribute('aria-busy', 'false');
  const scroll = await list.evaluate(element => { element.scrollTop = 180; return element.scrollTop; });
  expect(scroll).toBeGreaterThan(0);
  await expectStable(library(page), libraryBox);
  await expect(page.getByLabel('Fit name')).toBeHidden();
  await tabs.getByRole('button', { name: 'Results' }).click();
  await expect(stats(page)).toHaveAttribute('aria-busy', 'false');
  await expectStable(library(page), libraryBox);
  await tabs.getByRole('button', { name: 'Editor' }).click();
  await expect(page.getByLabel('Fit name')).toHaveValue('Rifter fit');
  await expectStable(library(page), libraryBox);
  await tabs.getByRole('button', { name: 'Catalog' }).click();
  expect(await list.evaluate(element => element.scrollTop)).toBe(scroll);
});

test('unrelated edits leave results, library and the existing canvas untouched', async ({ page }) => {
  await trackWork(page);
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByText('Simulation conditions', { exact: true }).click();
  await page.getByLabel('Simulate a target').check();
  await stats(page).getByText('Performance graphs', { exact: true }).click();
  const chart = page.getByRole('img', { name: 'Applied DPS by distance' });
  await expect(chart).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.workspaceTest.draws)).toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    const { calculations, draws } = window.workspaceTest;
    return { calculations, draws };
  });

  await page.evaluate(() => {
    const reportMutation = () => { document.body.dataset.unrelatedMutation = 'true'; };
    const observer = new MutationObserver(reportMutation);
    for (const selector of ['.library', '.stats']) {
      observer.observe(document.querySelector(selector)!, { attributes: true, childList: true, characterData: true, subtree: true });
    }
  });
  await page.getByLabel('Fit name').fill('Renamed Rifter');
  await page.getByText('Description', { exact: true }).click();
  await page.getByLabel('Fit description').fill('Notes');
  await catalog(page).getByRole('button', { name: 'Hulls', exact: true }).click();
  await expect(catalog(page).getByRole('list')).toHaveAttribute('aria-busy', 'false');
  const after = await page.evaluate(() => {
    const { calculations, draws } = window.workspaceTest;
    return { calculations, draws, mutated: Boolean(document.body.dataset.unrelatedMutation) };
  });
  expect(after).toEqual({ ...before, mutated: false });

  // Changing only the incoming damage mix recomputes tank without changing the DPS curve.
  const em = page.getByLabel('EM', { exact: true });
  await em.fill('2');
  await expect(stats(page)).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => window.workspaceTest.draws)).toBe(before.draws);
});

test.describe('Local SVG icons', () => {
  test.use({ locale: 'en-US' });

  test('hull, module and abyssal icons are rendered locally', async ({ page }) => {
    const svgRequests: string[] = [];
    page.on('request', request => { if (/\.svg(?:\?|$)|images\.eve/i.test(request.url())) svgRequests.push(request.url()); });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('YAFT | EVE fitting workspace');
    await page.getByLabel('Search hulls').fill('Confessor');
    const confessor = catalog(page).getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Confessor', exact: true }) });
    await expect(confessor.getByRole('img', { name: 'Tech III' })).toHaveText('T3');
    await confessor.getByRole('button', { name: 'Confessor', exact: true }).click();
    await expect(page.locator('.hull-heading').getByRole('img', { name: 'Tech III' })).toHaveText('T3');
    const search = page.getByLabel('Search equipment');
    await search.fill('200mm AutoCannon II');
    const t2 = catalog(page).getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Add 200mm AutoCannon II', exact: true }) });
    await expect(t2.getByRole('img', { name: 'Tech II' })).toHaveText('T2');
    const t2Path = await t2.locator('.type-mark').getAttribute('d');
    await search.fill('Republic Fleet 200mm Autocannon');
    const faction = catalog(page).getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Add Republic Fleet 200mm Autocannon', exact: true }) });
    await expect(faction.getByRole('img', { name: 'Faction' })).toHaveText('FAC');
    await expect(faction.locator('.type-mark')).not.toHaveAttribute('d', t2Path!);

    const now = new Date().toISOString();
    await page.getByLabel('Restore backup').setInputFiles({
      name: 'abyssal.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        formatVersion: 1, profiles: [], conditions: [], settings: { formatVersion: 1 },
        fits: [{
          id: 'abyssal', shipTypeId: 587, name: 'Abyssal Rifter', revision: 1, description: '',
          skillProfileId: 'all-v', status: 'draft', createdAt: now, updatedAt: now,
          items: [{ id: 'module', group: 'high', typeId: 2889, position: 0, quantity: 1, state: 'online',
            abyssal: { mutaplasmidTypeId: 1, sourceTypeId: 2889, attributes: {} } }],
        }],
      })),
    });
    await page.getByRole('button', { name: 'Restore library' }).click();
    await page.getByRole('button', { name: 'Open Abyssal Rifter' }).click();
    const module = page.locator('.fitted-item');
    const icon = module.getByRole('img', { name: 'Abyssal' });
    await expect(icon).toHaveText('ABY');
    const iconBox = await rectangle(icon);
    await expect(module.getByText('200mm AutoCannon II', { exact: true })).toBeVisible();
    expect((await rectangle(icon)).slice(2)).toEqual(iconBox.slice(2));
    expect(svgRequests).toEqual([]);
  });
});
