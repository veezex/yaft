import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createArtifacts } from '../data/artifacts.ts';
import { readSnapshot, sha256 } from '../data/snapshot.ts';
import type { PyfaFixtures } from './fixtures.ts';

const execute = promisify(execFile);

export async function generateReference(directory: string, dataset: string, template: PyfaFixtures): Promise<PyfaFixtures> {
  const oracle = resolve(directory);
  const source = resolve(dataset);
  const metadata = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'));
  const snapshot = await readSnapshot(metadata.release, source);
  const { manifest } = createArtifacts(snapshot);
  const { stdout } = await execute('git', ['rev-parse', 'HEAD'], { cwd: oracle });
  if (stdout.trim() !== template.pyfa.commit) throw new Error('Pyfa source checkout does not match the pinned commit');
  const { stdout: changes } = await execute('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: oracle });
  if (changes.trim()) throw new Error('The Pyfa checkout has modified tracked files');
  const python = resolve(oracle, '.venv/bin/python');
  const temp = await mkdtemp(resolve(tmpdir(), 'yaft-pyfa-oracle-'));
  try {
    const checkout = resolve(temp, 'Pyfa');
    const omit = new Set(['.git', '.venv', 'eve.db']);
    await cp(oracle, checkout, { recursive: true, filter: filename => !omit.has(filename.split('/').at(-1) ?? '') });
    const stubs = resolve(temp, 'stubs');
    await mkdir(stubs);
    await writeFile(resolve(stubs, 'wx.py'), 'class Colour:\n    def __init__(self, *args, **kwargs): pass\n');
    await execute(python, [resolve('scripts/pyfa/align-snapshot.py'), source, checkout], { cwd: checkout });
    const env = { ...process.env, PYTHONPATH: [stubs, checkout].join(':'), PYTHONNOUSERSITE: '1' };
    await execute(python, ['db_update.py'], { cwd: checkout, env, timeout: 180_000 });
    const input = template.cases.map(row => ({ name: row.name, fit: row.fit, metrics: Object.keys(row.expected) }));
    const inputPath = resolve(temp, 'input.json');
    await writeFile(inputPath, JSON.stringify(input));
    const { stdout: output } = await execute(python, [resolve('scripts/pyfa/reference.py'), inputPath],
      { cwd: checkout, env, timeout: 120_000, maxBuffer: 5_000_000 });
    const rows = JSON.parse(output) as { name: string; expected: Record<string, number | boolean | null> }[];
    if (rows.length !== template.cases.length) throw new Error('Pyfa did not produce all reference results');
    const cases = template.cases.map((row, index) => {
      if (rows[index].name !== row.name) throw new Error('Pyfa fixture identifiers changed');
      const expected = Object.fromEntries(Object.entries(row.expected).map(([key, metric]) => {
        const value = rows[index].expected[key];
        if (value === undefined) throw new Error(`Pyfa reference missing ${row.name}.${key}`);
        return [key, { ...metric, status: value === null ? 'not-applicable' as const : 'computed' as const, value: value ?? undefined }];
      }));
      return { ...row, expected };
    });
    return { ...template, cases, pyfa: { ...template.pyfa, databaseSha256: sha256(await readFile(resolve(checkout, 'eve.db'))) },
      dataset: { releaseId: manifest.sdeReleaseId, datasetSha256: manifest.provenance.datasetSha256,
        engineRulesVersion: manifest.engineRulesVersion } };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
