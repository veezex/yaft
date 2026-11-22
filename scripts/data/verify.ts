import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import type { CatalogIndex, DogmaDataset, TypeSegment } from '../../src/fitting/dataset.ts';
import { auditEffects } from '../../src/fitting/rules.ts';
import { isIdentifier } from '../../src/storage/catalog-contract.ts';
import { report, run, workRoot } from '../cli.ts';
import { compareParity } from '../pyfa/parity.ts';
import { baselinePath } from '../pyfa/fixtures.ts';
import { readArtifactTree } from './artifacts.ts';
import { sha256 } from './snapshot.ts';

const verificationSources = [
  'package-lock.json', 'scripts/data/verify.ts', 'scripts/pyfa/parity.ts',
  'src/fitting/engine-adapter.ts', 'src/fitting/metrics.ts', 'src/fitting/rules.ts',
  'src/storage/catalog-contract.ts',
];

export const fixturePath = () => process.env.YAFT_PARITY_FIXTURES || baselinePath;
export const acceptancePath = (id: string) => resolve(workRoot, 'reports', `${id}.verification.json`);

export async function verificationFingerprint(manifestBytes: Buffer) {
  const [files, fixture] = await Promise.all([
    Promise.all(verificationSources.map(async path => sha256(await readFile(path)))),
    readFile(fixturePath()),
  ]);
  return sha256(JSON.stringify({ manifest: sha256(manifestBytes), fixture: sha256(fixture), files }));
}

export async function verifyCandidate(id: string) {
  const directory = resolve(workRoot, 'candidates', id);
  const { bytes, manifest, content } = await readArtifactTree(directory);
  if (manifest.compatibilityId !== id) throw new Error('Candidate ID does not match its manifest');
  const decoded = new Map<string, unknown>();
  for (const file of manifest.files) {
    const buffer = content.get(file.url)!;
    const item = JSON.parse((file.encoding === 'gzip' ? gunzipSync(buffer) : buffer).toString('utf8'));
    if (item?.releaseId !== manifest.sdeReleaseId) throw new Error(`Wrong SDE release in ${file.url}`);
    decoded.set(file.segment ?? file.purpose, item);
  }
  const index = decoded.get('index') as CatalogIndex;
  const dogma = decoded.get('dogma') as DogmaDataset;
  const usedEffects = new Set<number>();
  const fittingCategories = new Set([6, 7, 8, 16, 18, 20, 32, 65, 66, 87]);
  const effects = new Set(dogma.effects.map(effect => effect.id));
  const attrs = new Set(dogma.attributes.map(attribute => attribute.id));
  const types = new Map<number, string>();
  for (const entry of index.types) {
    if (types.has(entry.typeId)) throw new Error(`Duplicate catalog type ${entry.typeId}`);
    types.set(entry.typeId, entry.segment);
  }
  for (const file of manifest.files.filter(file => file.purpose === 'types')) {
    const segment = decoded.get(file.segment!) as TypeSegment;
    for (const type of segment.types) {
      if (types.get(type.id) !== file.segment) throw new Error(`Catalog type ${type.id} is missing from the expected index segment`);
      types.delete(type.id);
      if (type.attributes.some(attribute => !attrs.has(attribute.id) || !Number.isFinite(attribute.v))) {
        throw new Error(`Invalid attribute on type ${type.id}`);
      }
      for (const effect of type.effects) {
        if (!effects.has(effect.id)) throw new Error(`Unknown effect ${effect.id} on type ${type.id}`);
        if (fittingCategories.has(type.categoryID)) usedEffects.add(effect.id);
      }
    }
  }
  if (types.size) throw new Error('Catalog index is incomplete');
  const unsupported = auditEffects(dogma.effects.filter(effect => usedEffects.has(effect.id)));
  const fingerprint = await verificationFingerprint(bytes);
  const failures = [...unsupported];
  let parity;
  try {
    parity = await compareParity(directory, fixturePath());
    failures.push(...parity.failures);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  return { status: failures.length ? 'blocked' : 'verified', candidateId: id, fingerprint,
    compatibilityId: id, manifestSha256: sha256(bytes), datasetSha256: manifest.provenance.datasetSha256,
    rules: manifest.engineRulesVersion, parity, failures };
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { candidate: { type: 'string' } } });
  if (!isIdentifier(values.candidate)) throw new Error('Usage: data:verify --candidate <id>');
  const path = acceptancePath(values.candidate);
  let result;
  try {
    result = await verifyCandidate(values.candidate);
  } catch (error) {
    result = { status: 'blocked', candidateId: values.candidate, failures: [error instanceof Error ? error.message : String(error)] };
  }
  await mkdir(resolve(workRoot, 'reports'), { recursive: true });
  await writeFile(path, JSON.stringify(result, null, 2) + '\n');
  report({ status: result.status, candidateId: values.candidate, path,
    failures: result.failures.slice(0, 10), failureCount: result.failures.length });
  if (result.status === 'blocked') process.exitCode = 1;
});
