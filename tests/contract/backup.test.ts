import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newFit } from '../../src/domain/fit.ts';
import { decodeBackup, encodeBackup } from '../../src/formats/backup.ts';
import { restoreConflicts } from '../../src/storage/restore.ts';

test('backup roundtrips user inputs and strips credential and catalog data', () => {
  const fit = { ...newFit(587, 'Rifter'), accessToken: 'do-not-export' };
  const text = encodeBackup({ fits: [fit], profiles: [], conditions: [], settings: { formatVersion: 1 } });
  assert.doesNotMatch(text, /do-not-export|accessToken|catalog|characterLinks/);
  assert.equal(decodeBackup(text).fits[0].id, fit.id);
  assert.throws(() => decodeBackup(text.replace(/"formatVersion": 1/g, '"formatVersion": 99')), /version/i);
  assert.throws(() => decodeBackup(text.replace('all-v', 'missing-skill-profile')), /reference/i);
});

test('restore lists existing records whose contents would be replaced', () => {
  const fit = newFit(587, 'First name');
  const backup = decodeBackup(encodeBackup({ fits: [{ ...fit, name: 'Second name' }], profiles: [], conditions: [], settings: { formatVersion: 1 } }));
  assert.deepEqual(restoreConflicts(backup, { ...backup, fits: [fit] }), [{ store: 'fits', id: fit.id, name: 'Second name' }]);
});
