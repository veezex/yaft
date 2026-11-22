import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import type { CatalogIndex, DogmaDataset, TypeSegment } from '../../src/fitting/dataset.ts';
import { calculateFit, EngineCatalog } from '../../src/fitting/engine-adapter.ts';
import { presetSkills } from '../../src/domain/skills.ts';
import { isIdentifier } from '../../src/storage/catalog-contract.ts';
import { readArtifactTree } from '../data/artifacts.ts';
import { report, run, workRoot } from '../cli.ts';
import { baselinePath, parseFixtures } from './fixtures.ts';

export async function compareParity(directory: string, fixture = baselinePath) {
  const [{ manifest, content }, fixtures] = await Promise.all([
    readArtifactTree(directory),
    readFile(fixture, 'utf8').then(value => parseFixtures(JSON.parse(value))),
  ]);
  if (fixtures.dataset.datasetSha256 !== manifest.provenance.datasetSha256 ||
      fixtures.dataset.releaseId !== manifest.sdeReleaseId || fixtures.dataset.engineRulesVersion !== manifest.engineRulesVersion ||
      fixtures.pyfa.commit !== manifest.pyfa.commit) {
    throw new Error('Pyfa reference and candidate have different dataset inputs or rules');
  }
  function read<T>(purpose: 'index' | 'dogma' | 'types', segment?: string): T {
    const file = manifest.files.find(file => file.purpose === purpose && file.segment === segment);
    if (!file) throw new Error(`Parity data missing: ${purpose} ${segment ?? ''}`);
    const bytes = content.get(file.url)!;
    return JSON.parse((file.encoding === 'gzip' ? gunzipSync(bytes) : bytes).toString('utf8')) as T;
  }
  const catalog = new EngineCatalog(read<CatalogIndex>('index'), read<DogmaDataset>('dogma'),
    async segment => read<TypeSegment>('types', segment));
  const failures: string[] = [];
  let assertions = 0;
  for (const fixture of fixtures.cases) {
    const fit = fixture.fit;
    const result = await calculateFit(catalog, { kind: 'calculate', requestId: fixture.name,
      compatibilityId: manifest.compatibilityId, fitRevision: fit.revision, fit,
      profile: presetSkills[fit.skillProfileId as keyof typeof presetSkills],
    });
    const actual = new Map(result.metrics.map(metric => [metric.key, metric]));
    for (const [key, expected] of Object.entries(fixture.expected)) {
      assertions++;
      const metric = actual.get(key);
      const matchesIdentity = metric?.status === expected.status && metric.unit === expected.unit;
      const tolerance = typeof expected.value === 'number' && !expected.discrete && expected.value !== 0
        ? Math.max(Math.abs(expected.value) * 0.005, (expected.displayStep ?? 0) / 2)
        : 0;
      const consistentValue = metric?.value === expected.value ||
        (typeof metric?.value === 'number' && typeof expected.value === 'number' &&
          Math.abs(metric.value - expected.value) <= tolerance);
      if (!matchesIdentity || !consistentValue) {
        failures.push(`${fixture.name} ${key}: expected ${expected.status} ${expected.value ?? ''} ${expected.unit}, got ${metric?.status ?? 'missing'} ${metric?.value ?? ''}`);
      }
    }
  }
  return { status: failures.length ? 'blocked' : 'verified', compatibilityId: manifest.compatibilityId,
    cases: fixtures.cases.length, assertions, failures };
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { candidate: { type: 'string' } } });
  if (values.candidate && !isIdentifier(values.candidate)) throw new Error('Invalid candidate ID');
  const directory = values.candidate ? resolve(workRoot, 'candidates', values.candidate) : 'public/catalog';
  const result = await compareParity(directory);
  report(result);
  if (result.failures.length) process.exitCode = 1;
});
