import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { report, run, workRoot } from '../cli.ts';
import { fetchBytes, readSnapshot, sdeRoot } from './snapshot.ts';
import { importSnapshot } from './import.ts';
import { isRecord, isReleaseId } from '../../src/storage/catalog-contract.ts';

run(async () => {
  const { values } = parseArgs({ options: { release: { type: 'string' }, check: { type: 'boolean' }, from: { type: 'string' } } });
  const directory = resolve(workRoot, 'reports');
  await mkdir(directory, { recursive: true });
  let requested = values.release;
  let result: Record<string, unknown>;
  try {
    if (!requested) {
      const bytes = await fetchBytes(new URL('latest/', sdeRoot));
      const discovery: unknown = JSON.parse(bytes.toString('utf8'));
      if (!isRecord(discovery) || !isReleaseId(discovery.release)) throw new Error('Could not resolve the current CCP release');
      requested = discovery.release;
    }
    const snapshot = await readSnapshot(requested, values.from);
    const raw = resolve(workRoot, 'sde');
    const known = (await readdir(raw).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return [];
    })).filter(isReleaseId).sort();
    const previous = known.includes(snapshot.releaseId) ? snapshot.releaseId : known.at(-1);
    const prior: { tables?: Record<string, { version: string; sha256: string; schemaSha256: string }> } | undefined =
      previous ? JSON.parse(await readFile(resolve(raw, previous, 'source.json'), 'utf8')) : undefined;
    const tables = Object.fromEntries(Object.entries(snapshot.tables).map(([name, table]) => [name,
      { version: table.version, sha256: table.sha256, schemaSha256: table.schemaSha256 }]));
    const changed = Object.entries(tables).flatMap(([name, value]) => {
      const old = prior?.tables?.[name];
      return !old || old.version !== value.version || old.sha256 !== value.sha256 || old.schemaSha256 !== value.schemaSha256 ? [name] : [];
    });
    const outcome = values.check ? {} : await importSnapshot(snapshot);
    result = { releaseId: snapshot.releaseId, buildNumber: snapshot.buildNumber, source: snapshot.source,
      status: previous === snapshot.releaseId && !changed.length ? 'unchanged' : 'staged',
      releaseDate: snapshot.releaseDate, manifestSha256: snapshot.manifestSha256,
      previous, changed, tables, changes: snapshot.tables._changes?.rows,
      schemaChanges: snapshot.tables._schemaChangelog?.rows, ...outcome };
  } catch (error) {
    result = { status: 'blocked', releaseId: requested, reason: error instanceof Error ? error.message : String(error) };
  }
  const path = resolve(directory, `update-${isReleaseId(requested) ? requested : 'latest'}.json`);
  await writeFile(path, JSON.stringify(result, null, 2));
  report({ status: result.status, releaseId: result.releaseId, path, changed: result.changed,
    candidateId: result.candidateId, reason: result.reason });
  if (result.status === 'blocked') process.exitCode = 1;
});
