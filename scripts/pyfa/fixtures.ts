import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { report, run } from '../cli.ts';
import type { Fit } from '../../src/domain/fit.ts';
import { isTypeId, validateFitItems } from '../../src/domain/fit.ts';
import { engineRulesVersion, isRecord, isReleaseId, isSha256, referencePyfa } from '../../src/storage/catalog-contract.ts';
import type { MetricStatus } from '../../src/fitting/worker-protocol.ts';

export const baselinePath = 'tests/parity/fixtures/baseline.json';

interface ExpectedMetric {
  status: MetricStatus;
  value?: number | boolean;
  unit: string;
  displayStep?: number;
  discrete?: boolean;
}
interface ReferenceCase {
  name: string;
  fit: Fit;
  expected: Record<string, ExpectedMetric>;
}

export interface PyfaFixtures {
  formatVersion: 1;
  pyfa: { tag: string; commit: string; databaseSha256: string; archiveSha256: string };
  dataset: { releaseId: string; datasetSha256: string; engineRulesVersion: string };
  cases: ReferenceCase[];
}

export function parseFixtures(value: unknown): PyfaFixtures {
  if (!isRecord(value) || value.formatVersion !== 1 ||
      !isRecord(value.pyfa) || value.pyfa.commit !== referencePyfa.commit || value.pyfa.tag !== referencePyfa.tag ||
      !isSha256(value.pyfa.databaseSha256) || !isSha256(value.pyfa.archiveSha256) ||
      !isRecord(value.dataset) || !isReleaseId(value.dataset.releaseId) || !isSha256(value.dataset.datasetSha256) ||
      value.dataset.engineRulesVersion !== engineRulesVersion || !Array.isArray(value.cases) || !value.cases.length) {
    throw new Error('Invalid Pyfa fixture schema, provenance, or dataset fingerprint');
  }
  const names = new Set();
  for (const example of value.cases) {
    if (!isRecord(example) || typeof example.name !== 'string' || !example.name.trim() || names.has(example.name) ||
        !isRecord(example.fit) || !isTypeId(example.fit.shipTypeId) || typeof example.fit.id !== 'string' ||
        !['all-v', 'all-zero'].includes(String(example.fit.skillProfileId)) ||
        !Array.isArray(example.fit.items) || validateFitItems(example.fit.items).length ||
        !isRecord(example.expected) || !Object.keys(example.expected).length) throw new Error('Invalid Pyfa fixture input');
    names.add(example.name);
    for (const [key, metric] of Object.entries(example.expected)) {
      if (!isRecord(metric) || !['computed', 'partial', 'unavailable', 'not-applicable'].includes(String(metric.status)) ||
          typeof metric.unit !== 'string' ||
          (metric.value !== undefined && typeof metric.value !== 'boolean' && !Number.isFinite(metric.value)) ||
          (metric.status === 'computed' && metric.value === undefined) ||
          (['not-applicable', 'unavailable'].includes(String(metric.status)) && metric.value !== undefined) ||
          (metric.displayStep !== undefined && (!Number.isFinite(metric.displayStep) || Number(metric.displayStep) <= 0))) {
        throw new Error(`Invalid Pyfa expectation for ${key}`);
      }
    }
  }
  return value as unknown as PyfaFixtures;
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { from: { type: 'string' }, output: { type: 'string' }, oracle: { type: 'string' }, dataset: { type: 'string' } } });
  if (!(values.from && !values.oracle && !values.dataset) && !(values.oracle && values.dataset && !values.from)) {
    throw new Error('Usage: pyfa:fixtures --from <directory> or --oracle <directory> --dataset <directory>');
  }
  const src = values.from ? resolve(values.from, 'baseline.json') : baselinePath;
  const path = resolve(values.output ?? baselinePath);
  const template = parseFixtures(JSON.parse(await readFile(src, 'utf8')));
  const fixtures = values.oracle && values.dataset
    ? parseFixtures(await (await import('./oracle.ts')).generateReference(values.oracle, values.dataset, template))
    : template;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(fixtures, null, 2) + '\n');
  report({ status: 'staged', path, cases: fixtures.cases.length, ...fixtures.dataset });
});
