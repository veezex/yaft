import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { extractContract, diffContract } from '../../scripts/esi/contract.ts';

test('the approved contract covers all five ESI operations, formats and scopes', async () => {
  const approved = JSON.parse(await readFile('src/esi/contract.snapshot.json', 'utf8'));
  assert.equal(approved.date, '2026-11-19');
  assert.match(approved.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.values(approved.operations).map(value => (value as { success: string }).success), ['200', '200', '201', '204', '200']);
  assert.equal(approved.operations.skills.pathParameters.character_id.format, 'int64');
  assert.deepEqual(approved.operations.createFit.scopes, ['esi-fittings.write_fittings.v1']);
  assert.deepEqual(approved.operations.prices.scopes, []);
  assert.deepEqual(diffContract(approved, structuredClone(approved)), []);
});

test('contract import rejects an incompatible OpenAPI fixture', async () => {
  const input = await readFile('tests/fixtures/esi/openapi-incompatible.json');
  assert.throws(() => extractContract(input, '2026-11-19'), /character_id|does not match/);
});
