import { expect, test } from '@playwright/test';

test('a 360px workspace reopens offline, calculates, saves, and exports a fit', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await page.goto('/');
  await expect(page.getByText('Offline ready', { exact: true })).toBeVisible();
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Save fit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await context.setOffline(true);
  await page.close();
  const restored = await context.newPage();
  await restored.setViewportSize({ width: 360, height: 820 });
  await restored.goto('/');
  await expect(restored.getByText('Offline · local workspace', { exact: true })).toBeVisible();
  await expect(restored.getByLabel('Fit name')).toHaveValue('Rifter fit');
  await expect(restored.locator('.hull-heading').getByRole('img', { name: 'Tech I' })).toHaveText('T1');

  await restored.getByRole('button', { name: 'Results', exact: true }).click();
  await expect(restored.getByRole('region', { name: 'Fitting results' })).toBeVisible();
  await restored.getByRole('button', { name: 'Preview export' }).click();
  await expect(restored.getByLabel('Exported fit')).toHaveValue(/\[Rifter, Rifter fit\]/);
});
