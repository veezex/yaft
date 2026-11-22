import { expect, test } from '@playwright/test';

test('backup transfers a saved fit into an isolated browser profile', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: 'Save fit', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const file = await (await download).path();
  const isolated = await browser.newContext();
  try {
    const clean = await isolated.newPage();
    await clean.goto('/');
    await expect(clean.getByRole('button', { name: 'Open Rifter fit' })).toHaveCount(0);
    await clean.getByLabel('Restore backup').setInputFiles(file!);
    await clean.getByRole('button', { name: 'Restore library' }).click();
    await expect(clean.getByRole('button', { name: 'Open Rifter fit' })).toBeVisible();
  } finally {
    await isolated.close();
  }
});
