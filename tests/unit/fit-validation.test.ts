import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyFit, newFit, validateFitItems } from '../../src/domain/fit.ts';
import type { FitItem } from '../../src/domain/fit.ts';
import { resourceWarnings } from '../../src/domain/fit-validation.ts';

test('copies keep unresolved type and charge references and create new local IDs', () => {
  const old = newFit(587, 'Original');
  old.items = [{ id: 'x', group: 'high', position: 0, quantity: 1,
    typeId: 12345, unknownSource: 'Previous module', charge: { unknownSource: 'Removed charge' } }];
  const clone = copyFit(old);
  assert.notEqual(clone.id, old.id);
  assert.notEqual(clone.items[0].id, old.items[0].id);
  assert.deepEqual(clone.items[0].charge, old.items[0].charge);
  assert.equal(clone.items[0].unknownSource, 'Previous module');
  assert.deepEqual(validateFitItems(clone.items), []);
});

test('duplicate positions and invalid quantities are reported', () => {
  const row: FitItem = { id: 'x', group: 'high', position: 0, quantity: 1, typeId: 123 };
  assert.match(validateFitItems([row, { ...row, id: 'y', quantity: -1 }]).join(' '), /quantity.*occupied/);
});

test('resource excess and exact limits are distinguished', () => {
  const fitting = { cpuUsed: 5, cpuMax: 4, powerUsed: 4, powerMax: 4, calibrationUsed: 0, calibrationMax: 0,
    droneBayUsed: 0, droneBayMax: 0, droneBandwidthUsed: 0, droneBandwidthMax: 0,
    slots: { HI: { used: 3, max: 2 } }, hardpoints: { turret: { used: 2, max: 1 } } };
  assert.deepEqual(resourceWarnings(fitting).map(w => w.code), ['resource-cpu', 'slots-HI', 'hardpoints-turret']);
});
