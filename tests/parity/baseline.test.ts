import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareParity } from '../../scripts/pyfa/parity.ts';

test('the pinned catalog matches the Pyfa v2.70.0 reference measurements', async () => {
  const result = await compareParity('public/catalog');
  assert.equal(result.cases, 7);
  assert.ok(result.assertions >= 121);
  assert.deepEqual(result.failures, []);
});
