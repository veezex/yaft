import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import {
  datasetSchemaVersion, enginePackageVersion, engineProtocolVersion, engineRulesVersion, parseRelease, referencePyfa,
} from '../../src/storage/catalog-contract.ts';
import type { Artifact, CompatibilityRelease } from '../../src/storage/catalog-contract.ts';
import { normalize } from './normalize.ts';
import { sha256 } from './snapshot.ts';
import type { SdeRelease } from './snapshot.ts';

export function createArtifacts(snapshot: SdeRelease) {
  const normalized = normalize(snapshot);
  const datasetSha256 = sha256(JSON.stringify(Object.entries(snapshot.tables)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([name, table]) => [name, table.version, table.sha256, table.schemaSha256])));
  const content = new Map<string, Buffer>();
  const files: Artifact[] = [];
  function add(purpose: Artifact['purpose'], value: unknown, segment?: string): void {
    const bytes = gzipSync(JSON.stringify(value), { level: 9 });
    const digest = sha256(bytes);
    const url = `blobs/${digest}.blob`;
    content.set(url, bytes);
    files.push({ purpose, segment, sha256: digest, bytes: bytes.length, url, encoding: 'gzip' });
  }
  add('index', normalized.index);
  add('dogma', normalized.dogma);
  for (const [key, segment] of normalized.segments) add('types', segment, key);
  const fingerprint = sha256(JSON.stringify([datasetSha256, engineRulesVersion, referencePyfa.commit, files]));
  const manifest: CompatibilityRelease = {
    formatVersion: 1,
    compatibilityId: `${snapshot.releaseId}-${fingerprint.slice(0, 20)}`,
    sdeReleaseId: snapshot.releaseId,
    sdeBuildNumber: snapshot.buildNumber,
    datasetSchemaVersion,
    engineProtocolVersion,
    engineRulesVersion,
    enginePackageVersion,
    localizedLabelsVersion: 1,
    pyfa: referencePyfa,
    provenance: {
      source: snapshot.source, releaseDate: snapshot.releaseDate,
      manifestSha256: snapshot.manifestSha256, datasetSha256,
    },
    files,
  };
  parseRelease(manifest);
  return { manifest, content };
}

export async function readArtifactTree(directory: string) {
  const bytes = await readFile(resolve(directory, 'manifest.json'));
  const manifest = parseRelease(JSON.parse(bytes.toString('utf8')));
  const content = new Map(await Promise.all(manifest.files.map(async file => {
    const data = await readFile(resolve(directory, file.url));
    if (data.byteLength !== file.bytes || sha256(data) !== file.sha256) throw new Error(`Invalid artifact: ${file.url}`);
    return [file.url, data] as const;
  })));
  return { bytes, manifest, content };
}
