import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { report, run, workRoot } from '../cli.ts';
import { createArtifacts } from './artifacts.ts';
import { readSnapshot, sha256 } from './snapshot.ts';
import type { SdeRelease } from './snapshot.ts';

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function moveNew(directory: string, fill: (temp: string) => Promise<void>): Promise<boolean> {
  await mkdir(dirname(directory), { recursive: true });
  const temp = await mkdtemp(join(dirname(directory), '.staging-'));
  try {
    await fill(temp);
    try {
      await rename(temp, directory);
      return true;
    } catch (error) {
      if (!['EEXIST', 'ENOTEMPTY'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      return false;
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function importSnapshot(snapshot: SdeRelease) {
  const sourceDir = resolve(workRoot, 'sde', snapshot.releaseId);
  const tables = Object.fromEntries(Object.entries(snapshot.tables).map(([name, table]) => [name, {
    version: table.version, sha256: table.sha256, schemaSha256: table.schemaSha256,
  }]));
  const identity = { releaseId: snapshot.releaseId, buildNumber: snapshot.buildNumber,
    releaseDate: snapshot.releaseDate, manifestSha256: snapshot.manifestSha256, tables };
  const serialized = JSON.stringify(identity, null, 2);
  if (!await readIfExists(join(sourceDir, 'source.json'))) {
    await moveNew(sourceDir, async temp => {
      await Promise.all([
        writeFile(join(temp, 'manifest.json'), snapshot.manifest),
        writeFile(join(temp, 'source.json'), serialized),
        ...Object.entries(snapshot.tables).flatMap(([name, table]) => [
          writeFile(join(temp, `${name}.jsonl`), table.raw),
          writeFile(join(temp, `${name}.schema.json`), table.schema),
        ]),
      ]);
    });
  }
  const existing = await readFile(join(sourceDir, 'source.json'), 'utf8');
  if (existing !== serialized) {
    const directory = resolve(workRoot, 'conflicts');
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${snapshot.releaseId}-${sha256(serialized)}.json`);
    await writeFile(path, serialized);
    throw new Error(`Immutable SDE snapshot conflict: ${path}`);
  }
  const { manifest, content } = createArtifacts(snapshot);
  const candidateDir = resolve(workRoot, 'candidates', manifest.compatibilityId);
  const publishedManifest = JSON.stringify(manifest, null, 2);
  const staged = await moveNew(candidateDir, async temp => {
    await mkdir(join(temp, 'blobs'));
    await Promise.all([
      writeFile(join(temp, 'manifest.json'), publishedManifest),
      ...Array.from(content, ([url, bytes]) => writeFile(join(temp, url), bytes)),
    ]);
  });
  const installed = JSON.parse(await readFile(join(candidateDir, 'manifest.json'), 'utf8')) as typeof manifest;
  if (installed.provenance.datasetSha256 !== manifest.provenance.datasetSha256) throw new Error('Candidate fingerprint conflict');
  return { status: staged ? 'staged' : 'unchanged', candidateId: manifest.compatibilityId,
    source: snapshot.source, path: candidateDir, ...identity };
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { release: { type: 'string' }, from: { type: 'string' } } });
  if (!values.release) throw new Error('Usage: data:import --release <id> [--from <directory>]');
  report(await importSnapshot(await readSnapshot(values.release, values.from)));
});
