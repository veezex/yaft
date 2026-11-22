import { expect, test } from '@playwright/test';

test('the built workspace searches and calculates on its pinned catalog', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'YAFT', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Catalog 20261120T165826Z ready');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  const fitting = page.getByRole('region', { name: 'Fitting results' });
  await fitting.getByText('All metrics', { exact: true }).click();

  await expect(fitting.getByText('162.5 tf', { exact: true }).first()).toBeVisible();
});
