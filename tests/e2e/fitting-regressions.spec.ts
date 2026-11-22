import { expect, test } from '@playwright/test';

test('fitted drones launch within the ship limits and can be recalled', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Dominix');
  await page.getByRole('button', { name: 'Dominix', exact: true }).click();
  const damage = page.locator('.stat-grid').getByText('Total damage', { exact: true }).locator('..').locator('dd');
  await expect(damage).toHaveText('0 DPS');
  await page.getByLabel('Search equipment').fill('Ogre II');
  await page.getByRole('button', { name: 'Add Ogre II', exact: true }).click();
  const row = page.locator('.fitted-item').filter({ hasText: 'Ogre II' });
  await expect(row.getByLabel('Active', { exact: true })).toHaveValue('1');
  await expect(damage).not.toHaveText('0 DPS');
  await row.getByLabel('Quantity', { exact: true }).fill('6');
  await expect(row.getByLabel('Active', { exact: true })).toHaveValue('5');
  await expect(page.getByRole('meter', { name: 'Drone bandwidth' })).toHaveAttribute('value', '125');
  await row.getByLabel('Active', { exact: true }).fill('0');
  await expect(damage).toHaveText('0 DPS');
  await row.getByRole('button', { name: 'Auto', exact: true }).click();
  await expect(row.getByLabel('Active', { exact: true })).toHaveValue('5');
  await expect(damage).not.toHaveText('0 DPS');
});

test('the hull mode selector offers only modes belonging to the selected hull', async ({ page }) => {
  await page.goto('/');
  const search = page.getByLabel('Search hulls');
  await search.fill('Dominix');
  await page.getByRole('button', { name: 'Dominix', exact: true }).click();
  await expect(page.locator('.stat-grid').getByText('Total damage', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hull mode', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Hull mode', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hulls', exact: true }).click();
  await search.fill('Confessor');
  await page.getByRole('button', { name: 'Confessor', exact: true }).click();
  const modes = page.getByRole('combobox', { name: 'Hull mode', exact: true });
  await expect(modes.locator('option')).toHaveText([
    'Confessor Defense Mode', 'Confessor Sharpshooter Mode', 'Confessor Propulsion Mode',
  ]);
  await expect(modes).toHaveValue('34319');
  await modes.selectOption({ label: 'Confessor Propulsion Mode' });
  await expect(modes).toHaveValue('34323');
  await expect(page.getByRole('region', { name: 'Fitting results' })).toHaveAttribute('aria-busy', 'false');
});

test('charge pickers filter by group, size, and module capacity', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  const search = page.getByLabel('Search equipment');
  const charges = page.getByLabel('Search charges');
  const catalog = page.getByRole('region', { name: 'Catalog', exact: true }).getByRole('list');
  async function add(name: string) {
    await search.fill(name);
    await page.getByRole('button', { name: `Add ${name}`, exact: true }).click();
    return page.locator('.fitted-item').filter({ hasText: name });
  }
  const gun = await add('200mm AutoCannon II');
  await gun.getByRole('button', { name: 'Choose charge' }).click();
  for (const incompatible of ['EMP M', 'Antimatter Charge S']) {
    await charges.fill(incompatible);
    await expect(catalog).toHaveAttribute('aria-busy', 'false');
    await expect(catalog.getByRole('button', { name: `Add ${incompatible}`, exact: true })).toHaveCount(0);
  }
  await charges.fill('EMP S');
  await page.getByRole('button', { name: 'Add EMP S', exact: true }).click();
  await expect(gun.getByRole('button', { name: 'EMP S', exact: true })).toBeVisible();

  const repairer = await add('Small Armor Repairer II');
  await expect(repairer.getByRole('button', { name: 'Choose charge' })).toHaveCount(0);
  const booster = await add('Small Capacitor Booster II');
  await booster.getByRole('button', { name: 'Choose charge' }).click();
  await charges.fill('Cap Booster 800');
  await expect(catalog).toHaveAttribute('aria-busy', 'false');
  await expect(catalog.getByRole('button', { name: 'Add Cap Booster 800', exact: true })).toHaveCount(0);
  await charges.fill('Navy Cap Booster 400');
  await page.getByRole('button', { name: 'Add Navy Cap Booster 400', exact: true }).click();
  await expect(booster.getByRole('button', { name: 'Navy Cap Booster 400', exact: true })).toBeVisible();
});

test('the catalog rejects equipment that does not fit the hull', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Rifter');
  await page.getByRole('button', { name: 'Rifter', exact: true }).click();
  const catalog = page.getByRole('region', { name: 'Catalog' });
  const search = catalog.getByLabel('Search equipment');
  const toast = catalog.getByRole('alert');
  const warnings = page.getByRole('region', { name: 'Fit warnings' });
  const fitted = page.locator('.fitted-item');
  async function pick(name: string) {
    await search.fill(name);
    await catalog.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  }

  await pick('Assault Damage Control II');
  await expect(toast).toHaveText('Assault Damage Control II: requires a different hull');
  await expect(fitted).toHaveCount(0);
  await expect(warnings).not.toContainText('requires a different hull');
  await catalog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toBeEmpty();

  await pick('Capital Hybrid Collision Accelerator I');
  await expect(toast).toHaveText('Capital Hybrid Collision Accelerator I: rig size differs from the hull');
  await expect(fitted).toHaveCount(0);
  await expect(warnings).not.toContainText('rig size differs from the hull');

  await pick('Small Hybrid Collision Accelerator I');
  const smallRig = fitted.filter({ hasText: 'Small Hybrid Collision Accelerator I' });
  await smallRig.getByRole('button', { name: 'Replace Small Hybrid Collision Accelerator I' }).click();
  await pick('Capital Hybrid Collision Accelerator I');
  await expect(toast).toHaveText('Capital Hybrid Collision Accelerator I: rig size differs from the hull');
  await expect(smallRig).toBeVisible();
  await expect(fitted).toHaveCount(1);

  await catalog.getByRole('button', { name: 'Equipment' }).click();
  await catalog.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Cargo' });
  await pick('Assault Damage Control II');
  await expect(fitted.filter({ hasText: 'Assault Damage Control II' })).toBeVisible();
  await expect(smallRig).toBeVisible();
  await expect(page.getByRole('region', { name: 'Fitting results' })).toHaveAttribute('aria-busy', 'false');
  await expect(warnings).not.toContainText('requires a different hull');

  await catalog.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'All equipment' });
  await catalog.getByRole('button', { name: 'Hulls' }).click();
  await catalog.getByLabel('Search hulls').fill('Hawk');
  await catalog.getByRole('button', { name: 'Hawk', exact: true }).click();
  await pick('Assault Damage Control II');
  await expect(fitted.filter({ hasText: 'Assault Damage Control II' })).toHaveCount(2);
});

test('pending equipment picks use the active hull and retain concurrent additions', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options) {
      if (message.kind !== 'validate-equipment') {
        Reflect.apply(post, this, [message, options]);
        return;
      }
      document.addEventListener('release-equipment-validation', () => {
        Reflect.apply(post, this, [message, options]);
      }, { once: true });
      const pending = Number(document.body.dataset.pendingEquipmentValidation ?? '0');
      document.body.dataset.pendingEquipmentValidation = String(pending + 1);
    };
  });
  await page.goto('/');
  const catalog = page.getByRole('region', { name: 'Catalog' });
  await catalog.getByLabel('Search hulls').fill('Hawk');
  await catalog.getByRole('button', { name: 'Hawk', exact: true }).click();
  const search = catalog.getByLabel('Search equipment');
  await search.fill('Assault Damage Control II');
  await catalog.getByRole('button', { name: 'Add Assault Damage Control II', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-pending-equipment-validation', '1');

  await catalog.getByRole('button', { name: 'Hulls' }).click();
  await catalog.getByLabel('Search hulls').fill('Rifter');
  await catalog.getByRole('button', { name: 'Rifter', exact: true }).click();
  await search.fill('200mm AutoCannon II');
  const add = catalog.getByRole('button', { name: 'Add 200mm AutoCannon II', exact: true });
  await expect(add).toBeEnabled();
  await add.evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.locator('body')).toHaveAttribute('data-pending-equipment-validation', '3');
  await page.evaluate(() => document.dispatchEvent(new Event('release-equipment-validation')));
  const fitted = page.locator('.fitted-item');
  await expect(fitted.filter({ hasText: '200mm AutoCannon II' })).toHaveCount(2);
  await expect(fitted.filter({ hasText: 'Assault Damage Control II' })).toHaveCount(0);
});

test('catalog fields align and the mobile error toast does not move the list', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.install();
  await page.goto('/');
  const catalog = page.getByRole('region', { name: 'Catalog', exact: true });
  await catalog.getByLabel('Search hulls').fill('Rifter');
  await catalog.getByRole('button', { name: 'Rifter', exact: true }).click();
  const search = catalog.getByLabel('Search equipment');
  const category = catalog.getByRole('combobox', { name: 'Category' });
  async function expectAlignedFields() {
    const inputBounds = (await search.boundingBox())!;
    const selectBounds = (await category.boundingBox())!;
    expect(inputBounds.height).toBeCloseTo(selectBounds.height, 1);
    expect(inputBounds.y).toBeCloseTo(selectBounds.y, 1);
  }
  await expectAlignedFields();

  await page.setViewportSize({ width: 390, height: 844 });
  const catalogTab = page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Catalog' });
  await catalogTab.click();
  await expectAlignedFields();
  await search.fill('Assault Damage Control II');
  const add = catalog.getByRole('button', { name: 'Add Assault Damage Control II', exact: true });
  await expect(add).toBeEnabled();
  const list = catalog.getByRole('list');
  const before = await list.boundingBox();
  await add.click();
  const toast = catalog.getByRole('alert');
  await expect(toast).toHaveText('Assault Damage Control II: requires a different hull');
  await expect(catalogTab).toHaveAttribute('aria-pressed', 'true');
  expect(await list.boundingBox()).toEqual(before);

  const firstMessage = await toast.locator('span').elementHandle();
  await page.clock.fastForward(4000);
  await add.click();
  await firstMessage.waitForElementState('hidden');
  await page.clock.fastForward(1100);
  await expect(toast).toHaveText('Assault Damage Control II: requires a different hull');
  await page.clock.fastForward(5000);
  await expect(toast).toBeEmpty();
});

test('recalculation and short catalog searches keep the workbench in place', async ({ page }) => {
  await page.addInitScript(() => {
    const post = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message, options) {
      if (message.kind === 'calculate' && document.body.dataset.delayCalculation === 'true') {
        setTimeout(() => Reflect.apply(post, this, [message, options]), 600);
      } else {
        Reflect.apply(post, this, [message, options]);
      }
    };
  });
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Dominix');
  await page.getByRole('button', { name: 'Dominix', exact: true }).click();
  const damage = page.locator('.stat-grid').getByText('Total damage', { exact: true }).locator('..').locator('dd');
  await expect(damage).toHaveText('0 DPS');
  const library = page.getByRole('region', { name: 'Local library' });
  const stats = page.getByRole('region', { name: 'Fitting results' });
  const before = await library.boundingBox();
  await page.getByLabel('Search equipment').fill('zyx-no-such-equipment');
  await expect(page.getByText('No matches.', { exact: true })).toBeVisible();
  expect((await library.boundingBox())!.y).toBeCloseTo(before!.y, 0);

  await page.evaluate(() => { document.body.dataset.delayCalculation = 'true'; });
  await page.getByLabel('Skill profile').selectOption('all-zero');
  await expect(stats).toHaveAttribute('aria-busy', 'true');
  await expect(damage).toHaveText('0 DPS');
  await expect(page.getByRole('heading', { name: /^High slots/ })).toBeVisible();
  expect((await library.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expect(stats).toHaveAttribute('aria-busy', 'false');
});

test('legacy incompatible equipment stays visible and is excluded from calculations', async ({ page }) => {
  await page.goto('/');
  const now = new Date().toISOString();
  const legacyFit = {
    id: 'legacy-fit', revision: 1, shipTypeId: 645, modeTypeId: 34323, name: 'Legacy Dominix', description: '',
    skillProfileId: 'all-v', status: 'draft', createdAt: now, updatedAt: now,
    items: [{ id: 'gun', typeId: 2889, group: 'high', position: 0, quantity: 1, state: 'active', charge: { typeId: 222 } }],
  };
  await page.getByLabel('Restore backup').setInputFiles({
    name: 'legacy-fit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
      formatVersion: 1, fits: [legacyFit], profiles: [], conditions: [], settings: { formatVersion: 1 },
    })),
  });
  await page.getByRole('button', { name: 'Restore library' }).click();
  await page.getByRole('button', { name: 'Open Legacy Dominix' }).click();
  await expect(page.getByText('The selected hull mode is unavailable for this hull')).toBeVisible();
  await expect(page.getByText('Antimatter Charge S is incompatible with 200mm AutoCannon II')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear mode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unload Antimatter Charge S' })).toBeVisible();
  await expect(page.locator('.stat-grid').getByText('Total damage', { exact: true }).locator('..').locator('dd'))
    .toHaveText('0 DPS · partial');
});

test('Tachyon Beam Laser II cannot load Arch Angel EMP M from the picker or EFT', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Dominix');
  await page.getByRole('button', { name: 'Dominix', exact: true }).click();
  await page.getByLabel('Search equipment').fill('Tachyon Beam Laser II');
  await page.getByRole('button', { name: 'Add Tachyon Beam Laser II', exact: true }).click();
  const laser = page.locator('.fitted-item').filter({ hasText: 'Tachyon Beam Laser II' });
  const chargeCatalog = page.getByRole('region', { name: 'Catalog' }).getByRole('list');
  await laser.getByRole('button', { name: 'Choose charge' }).click();
  await page.getByLabel('Search charges').fill('Arch Angel EMP M');
  await expect(chargeCatalog).toHaveAttribute('aria-busy', 'false');
  await expect(chargeCatalog.getByText('No matches.')).toBeVisible();
  await page.getByLabel('Search charges').fill('Multifrequency L');
  await chargeCatalog.getByRole('button', { name: 'Add Multifrequency L', exact: true }).click();
  await expect(laser.getByRole('button', { name: 'Multifrequency L', exact: true })).toBeVisible();

  const exchange = page.getByRole('region', { name: 'Fit exchange' });
  await exchange.getByLabel('Fit text').fill('[Dominix, Imported laser]\nTachyon Beam Laser II, Arch Angel EMP M');
  await exchange.getByRole('button', { name: 'Preview import' }).click();
  await expect(exchange.getByRole('list', { name: 'Import warnings' })).toContainText('Arch Angel EMP M');
  await exchange.getByRole('button', { name: 'Import known entries' }).click();
  await expect(page.getByLabel('Fit name')).toHaveValue('Imported laser');
  await expect(laser.getByRole('button', { name: 'Choose charge' })).toBeVisible();
  await expect(laser.getByRole('button', { name: /Arch Angel EMP M/ })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Hull mode' })).toHaveCount(0);
});

test('changing drone quantity keeps the library and panels in place even when a warning appears', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search hulls').fill('Dominix');
  await page.getByRole('button', { name: 'Dominix', exact: true }).click();
  await page.getByLabel('Search equipment').fill('Ogre II');
  await page.getByRole('button', { name: 'Add Ogre II', exact: true }).click();
  const row = page.locator('.fitted-item').filter({ hasText: 'Ogre II' });
  await expect(row.getByLabel('Active', { exact: true })).toHaveValue('1');
  await page.getByText('All metrics', { exact: true }).click();
  const before = await page.getByRole('region', { name: 'Local library' }).evaluate(el =>
    el.getBoundingClientRect().top + window.scrollY);
  await row.getByLabel('Quantity', { exact: true }).fill('16');
  await expect(row.getByLabel('Active', { exact: true })).toHaveValue('5');
  await expect(page.getByText(/Drone bay exceeds its limit/)).toBeVisible();
  const after = await page.getByRole('region', { name: 'Local library' }).evaluate(el =>
    el.getBoundingClientRect().top + window.scrollY);
  expect(after).toBeCloseTo(before, 0);
});
