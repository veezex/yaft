import { expect, test } from '@playwright/test';

test('partial import previews unresolved items, cancels safely, and exports the accepted fit', async ({ page }) => {
  await page.goto('/');
  const exchange = page.getByRole('region', { name: 'Fit exchange' });
  await exchange.getByLabel('Fit text').fill('[Rifter, Imported fit]\n200mm AutoCannon II\nUnlisted unique test item');
  await exchange.getByRole('button', { name: 'Preview import' }).click();
  await expect(exchange.getByText(/Unlisted unique test item/)).toBeVisible();
  await exchange.getByRole('button', { name: 'Cancel import' }).click();
  await expect(page.getByRole('button', { name: 'Open Imported fit' })).toHaveCount(0);
  await exchange.getByRole('button', { name: 'Preview import' }).click();
  await exchange.getByRole('button', { name: 'Import known entries' }).click();
  await expect(page.getByRole('button', { name: 'Open Imported fit' })).toBeVisible();
  await exchange.getByLabel('Transfer format').selectOption('xml');
  await exchange.getByRole('button', { name: 'Preview export' }).click();
  await expect(exchange.getByLabel('Exported fit')).toHaveValue(/200mm AutoCannon II/);
});

test('comparison recalculates two fits with one profile and the same target distance', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Save fit', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate fit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Rifter fit copy' })).toBeVisible();
  await page.getByText('Simulation conditions', { exact: true }).click();
  await page.getByLabel('Simulate a target').check();
  await page.getByLabel('Target distance (m)').fill('8200');
  await page.getByText('Compare fits', { exact: true }).click();
  await page.getByRole('checkbox', { name: 'Rifter fit', exact: true }).check();
  await expect(page.getByText(/target at 8200 m/)).toBeVisible();
  await expect(page.getByRole('table')).toContainText('Applied damage');
  await page.getByText('Performance graphs', { exact: true }).click();
  await expect(page.getByRole('img', { name: 'Applied DPS by distance' })).toBeVisible();
});
