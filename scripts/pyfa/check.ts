import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isRecord } from '../../src/storage/catalog-contract.ts';
import { ruleSources } from '../../src/fitting/rules.ts';
import { report, run, workRoot } from '../cli.ts';
import { baselinePath, parseFixtures } from './fixtures.ts';

const repository = 'https://api.github.com/repos/pyfa-org/Pyfa';
async function github(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${repository}${path}`, {
    headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pyfa upstream returned HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!isRecord(data)) throw new Error('Unexpected response from Pyfa upstream');
  return data;
}

run(async () => {
  const { values } = parseArgs({ options: { ref: { type: 'string' } } });
  const directory = resolve(workRoot, 'reports');
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, 'pyfa-check.json');
  let result;
  try {
    const baseline = parseFixtures(JSON.parse(await readFile(baselinePath, 'utf8')));
    const release = await github(values.ref ? `/releases/tags/${encodeURIComponent(values.ref)}` : '/releases/latest');
    if (typeof release.tag_name !== 'string' || release.prerelease !== false || release.draft !== false) throw new Error('Could not resolve a public stable Pyfa tag');
    const tag = release.tag_name;
    const tip = await github(`/commits/${encodeURIComponent(tag)}`);
    if (typeof tip.sha !== 'string' || !/^[0-9a-f]{40}$/.test(tip.sha)) throw new Error('Could not resolve the Pyfa commit');
    const unchanged = baseline.pyfa.commit === tip.sha;
    const diff = unchanged ? undefined : await github(`/compare/${baseline.pyfa.commit}...${tip.sha}`);
    const files = Array.isArray(diff?.files) ? diff.files.flatMap(value =>
      isRecord(value) && typeof value.filename === 'string' ? [value.filename] : []) : [];
    const changed = files.filter(file => /^(eos\/|staticdata\/|db_update\.py$)/.test(file));
    result = { status: unchanged ? 'unchanged' : 'staged', tag, commit: tip.sha, baselineCommit: baseline.pyfa.commit,
      publishedAt: release.published_at, ruleSources, changed,
      affectedCases: unchanged ? [] : baseline.cases.map(example => example.name), path };
  } catch (error) {
    result = { status: 'blocked', path, reason: error instanceof Error ? error.message : String(error) };
  }
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  report(result);
  if (result.status === 'blocked') process.exitCode = 1;
});
