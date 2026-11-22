import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('market estimate uses known prices and lists unpriced equipment without an EVE login', async ({ page }) => {
  await page.route('https://esi.evetech.net/markets/prices', route => {
    expect(route.request().headers()['x-compatibility-date']).toBe('2026-11-19');
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({ json: [{ type_id: 587, average_price: 13_000 }, { type_id: 2889 }],
      headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByLabel('Search equipment').fill('200mm AutoCannon II');
  await page.getByRole('button', { name: 'Add 200mm AutoCannon II', exact: true }).click();
  await page.getByText('Market estimate', { exact: true }).click();
  await page.getByRole('button', { name: 'Get market estimate' }).click();
  await expect(page.getByText(/incomplete estimate/)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Items without a market estimate' })).toContainText('200mm AutoCannon II');
});
