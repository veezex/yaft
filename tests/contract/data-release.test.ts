import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createArtifacts } from '../../scripts/data/artifacts.ts';
import { readSnapshot } from '../../scripts/data/snapshot.ts';
import { nextPointer } from '../../scripts/data/channel-target.ts';
import { auditEffects } from '../../src/fitting/rules.ts';

const fixture = 'tests/fixtures/sde/baseline';

test('release identity distinguishes snapshots with the same build number', async () => {
  const first = await readSnapshot('20260101T000000Z', fixture);
  const second = { ...first, releaseId: '20260102T000000Z' };
  assert.equal(first.buildNumber, second.buildNumber);
  assert.notEqual(createArtifacts(first).manifest.compatibilityId, createArtifacts(second).manifest.compatibilityId);
});

test('rollback advances the pointer revision and repeating publication keeps it stable', () => {
  const a = { compatibilityId: 'a', url: '/updates/releases/a/manifest.json', sha256: 'a'.repeat(64) };
  const b = { compatibilityId: 'b', url: '/updates/releases/b/manifest.json', sha256: 'b'.repeat(64) };
  const current = nextPointer(nextPointer(undefined, a), b);
  assert.equal(nextPointer(current, b), current);
  const rolledBack = nextPointer(current, a);
  assert.equal(rolledBack.revision, 3);
  assert.deepEqual(rolledBack.current, a);
  assert.deepEqual(rolledBack.previous, b);
});

test('unrecognized significant modifier operations block coverage', () => {
  const diagnostics = auditEffects([{
    id: 999999, name: 'fixture', modifierInfo: [{ domain: 'itemID', func: 'ItemModifier', operation: 999 }],
  }]);
  assert.deepEqual(diagnostics, ['999999 fixture: unsupported operation 999']);
});

test('concurrent publishers have one channel writer', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { exclusiveChannel } = await import('../../scripts/data/channel-target.ts');
  const directory = await mkdtemp(join(tmpdir(), 'yaft-release-test-'));
  t.after(() => rm(directory, { recursive: true }));
  let enter!: () => void;
  let finish!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const release = new Promise<void>(resolve => { finish = resolve; });
  const current = exclusiveChannel(directory, async () => {
    enter();
    return release;
  });
  await entered;
  try {
    await assert.rejects(exclusiveChannel(directory, async () => undefined), /Another publisher/);
  } finally {
    finish();
    await current;
  }
});
