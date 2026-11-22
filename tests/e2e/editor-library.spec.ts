import { expect, test } from '@playwright/test';

test('edits, warns, saves, copies, and restores a local draft', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('combobox', { name: 'Skill profile' }).selectOption('all-zero');
  await page.getByLabel('Search equipment').fill('200mm AutoCannon II');
  await page.getByRole('button', { name: 'Add 200mm AutoCannon II', exact: true }).click();
  await expect(page.getByText(/requires.*level/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Choose charge', exact: true }).click();
  await page.getByLabel('Search charges').fill('EMP S');
  await page.getByRole('button', { name: 'Add EMP S', exact: true }).click();
  await page.getByLabel('State of 200mm AutoCannon II').selectOption('active');
  await expect(page.getByRole('button', { name: 'EMP S', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Fit name' }).fill('Rifter draft');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Rifter draft', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Duplicate fit', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open Rifter draft copy', exact: true })).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup', exact: true }).click();
  const filename = await (await downloadEvent).path();
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.goto('/');
    await other.getByLabel('Restore backup').setInputFiles(filename!);
    await other.getByRole('button', { name: 'Restore library', exact: true }).click();
    await expect(other.getByRole('button', { name: 'Open Rifter draft', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
  await page.getByLabel('Restore backup').setInputFiles({
    name: 'malformed.json', mimeType: 'application/json', buffer: Buffer.from('{"formatVersion":99}'),
  });
  await expect(page.getByText('Unsupported backup format version')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Rifter draft copy', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open Rifter draft', exact: true })).toBeVisible();
});

test('saving with an older fit revision preserves the other tab’s changes', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  await page.getByRole('button', { name: /Save fit|Save draft/ }).click();
  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Open Rifter fit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Fit name' }).fill('First tab');
  await page.getByRole('button', { name: /Save fit|Save draft/ }).click();
  await expect(page.getByRole('button', { name: 'Open First tab', exact: true })).toBeVisible();
  await second.getByRole('textbox', { name: 'Fit name' }).fill('Second tab');
  await second.getByRole('button', { name: /Save fit|Save draft/ }).click();
  await expect(second.getByText(/changed in another tab/i)).toBeVisible();
  await expect(second.getByRole('textbox', { name: 'Fit name' })).toHaveValue('Second tab');
});
