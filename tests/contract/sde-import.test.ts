import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSnapshot } from '../../scripts/data/snapshot.ts';

const fixture = 'tests/fixtures/sde/baseline';

test('a pinned snapshot records table versions, schemas and stable hashes', async () => {
  const snapshot = await readSnapshot('20260101T000000Z', fixture);
  assert.equal(snapshot.releaseId, '20260101T000000Z');
  assert.equal(snapshot.buildNumber, 1);
  assert.equal(snapshot.tables.types.version, 'a'.repeat(64));
  assert.match(snapshot.tables.types.sha256, /^[0-9a-f]{64}$/);
  assert.match(snapshot.tables.types.schemaSha256, /^[0-9a-f]{64}$/);
  assert.equal(snapshot.tables.types.rows[0].typeID, 900001);
});

test('a manifest mismatch or dangling dogma reference blocks import', async t => {
  await assert.rejects(readSnapshot('20260102T000000Z', fixture), /release/);
  const directory = await mkdtemp(join(tmpdir(), 'yaft-contract-'));
  t.after(() => rm(directory, { recursive: true }));
  await cp(fixture, directory, { recursive: true });
  const path = join(directory, 'typeDogma.jsonl');
  await writeFile(path, (await readFile(path, 'utf8')).replace('900001', '900002'));
  await assert.rejects(readSnapshot('20260101T000000Z', directory), /typeDogma.*900002/);
});
