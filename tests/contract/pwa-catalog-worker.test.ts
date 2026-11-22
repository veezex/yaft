import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyArtifact } from '../../src/storage/catalog-contract.ts';
import { isCurrentCalculation, parseWorkerRequest } from '../../src/fitting/worker-protocol.ts';

test('an artifact must match both its declared size and decoded SHA-256', async () => {
  const bytes = new TextEncoder().encode('abc');
  const file = { bytes: 3, sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' };
  await verifyArtifact(file, bytes.buffer);
  await assert.rejects(verifyArtifact({ ...file, bytes: 4 }, bytes.buffer), /size/);
  await assert.rejects(verifyArtifact({ ...file, sha256: 'a'.repeat(64) }, bytes.buffer), /SHA-256/);
});

test('worker contracts use a pinned compatibility ID and limit search pages', () => {
  const base = { requestId: 'request-1', compatibilityId: 'catalog-a' };
  const initialize = { ...base, kind: 'initialize' };
  const search = { ...base, kind: 'search', query: '', limit: 30, offset: 0 };
  const calculate = { ...base, kind: 'calculate', fitRevision: 2, fit: {}, profile: {} };
  assert.deepEqual(parseWorkerRequest(initialize), initialize);
  assert.deepEqual(parseWorkerRequest(search), search);
  assert.throws(() => parseWorkerRequest({ ...search, limit: 1000 }), /search/);
  assert.throws(() => parseWorkerRequest({ ...calculate, fit: undefined }), /calculate/);
  assert.ok(isCurrentCalculation(calculate, { ...base, fitRevision: 2 }));
  assert.ok(!isCurrentCalculation(calculate, { ...base, fitRevision: 3 }));
  assert.ok(!isCurrentCalculation(calculate, { ...base, compatibilityId: 'catalog-b', fitRevision: 2 }));
});
