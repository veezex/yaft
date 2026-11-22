import { LocalizedError, msg } from '../i18n/index.ts';
import type { Artifact, FrozenRelease, InstalledCatalog } from './catalog-contract.ts';
import { parseRelease, verifyArtifact } from './catalog-contract.ts';
import { readRequest, transact } from './database.ts';
import type { CatalogIndex, DogmaDataset, TypeSegment } from '../fitting/dataset.ts';
import { verifyDatasetRelease } from '../fitting/dataset.ts';

export interface LocalCatalogPointer {
  compatibilityId: string;
  localRevision: number;
  channelRevision: number;
  previousId?: string;
}

export async function getActivePointer(): Promise<LocalCatalogPointer | undefined> {
  return transact('catalogPointer', 'readonly', transaction =>
    readRequest<LocalCatalogPointer | undefined>(transaction.objectStore('catalogPointer').get('active')));
}

export async function installedRelease(id: string): Promise<FrozenRelease | undefined> {
  const record = await transact('catalogs', 'readonly', transaction =>
    readRequest<InstalledCatalog | undefined>(transaction.objectStore('catalogs').get(id)));
  return record && ['verified', 'active', 'retained'].includes(record.state) ? parseRelease(record.manifest) : undefined;
}

async function fetchArtifact(url: URL): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new LocalizedError(msg('catalogFileStatus', url.pathname, response.status));
  return response.arrayBuffer();
}

export async function loadRelease(url: URL, expected?: { compatibilityId?: string; sha256?: string }) {
  const bytes = await fetchArtifact(url);
  if (expected?.sha256) await verifyArtifact({ sha256: expected.sha256 }, bytes);
  const manifest = parseRelease(JSON.parse(new TextDecoder().decode(bytes)) as unknown);
  if (expected?.compatibilityId && expected.compatibilityId !== manifest.compatibilityId) {
    throw new LocalizedError(msg('catalogManifestIdMismatch'));
  }
  return manifest;
}

async function decodeArtifact<T>(manifest: FrozenRelease, file: Readonly<Artifact>, bytes: ArrayBuffer): Promise<T> {
  const stream = new Blob([bytes]).stream();
  const decoded = new Response(file.encoding === 'gzip' ? stream.pipeThrough(new DecompressionStream('gzip')) : stream);
  const data: { releaseId: string } = await decoded.json();
  verifyDatasetRelease(manifest, data);
  return data as T;
}

export async function downloadCatalog(manifest: FrozenRelease, base: URL): Promise<Map<string, ArrayBuffer>> {
  const files = await Promise.all(manifest.files.map(async file => {
    const url = new URL(file.url, base);
    if (url.origin !== base.origin) throw new LocalizedError(msg('unexpectedCatalogArtifactOrigin'));
    const bytes = await fetchArtifact(url);
    await verifyArtifact(file, bytes);
    return [file.sha256, bytes] as const;
  }));
  const artifacts = new Map(files);
  const indexFile = manifest.files.find(file => file.purpose === 'index')!;
  const index = await decodeArtifact<CatalogIndex>(manifest, indexFile, artifacts.get(indexFile.sha256)!);
  const availableSegments = new Set(manifest.files.map(file => file.segment));
  if (!Array.isArray(index.types) || index.types.some(entry => !availableSegments.has(entry.segment))) {
    throw new LocalizedError(msg('catalogIndexReferencesMissingType'));
  }
  if (manifest.localizedLabelsVersion) {
    const dogmaFile = manifest.files.find(file => file.purpose === 'dogma')!;
    const { localizedLabels } = await decodeArtifact<DogmaDataset>(manifest, dogmaFile, artifacts.get(dogmaFile.sha256)!);
    if (!localizedLabels?.groups || !localizedLabels.categories || !localizedLabels.attributes || !localizedLabels.units) {
      throw new LocalizedError(msg('invalidCatalogArtifact'));
    }
  }
  return artifacts;
}

export async function activateCatalog(
  manifest: FrozenRelease,
  artifacts: ReadonlyMap<string, ArrayBuffer>,
  expectedLocalRevision: number,
  channelRevision?: number,
): Promise<LocalCatalogPointer> {
  for (const file of manifest.files) {
    const bytes = artifacts.get(file.sha256);
    if (!bytes) throw new LocalizedError(msg('missingArtifactAtActivation'));
    await verifyArtifact(file, bytes);
  }
  return transact(['catalogPointer', 'catalogs', 'artifacts'], 'readwrite', async transaction => {
    const pointers = transaction.objectStore('catalogPointer');
    const catalogs = transaction.objectStore('catalogs');
    const blobs = transaction.objectStore('artifacts');
    const current = await readRequest<LocalCatalogPointer | undefined>(pointers.get('active'));
    const previousRevision = current?.channelRevision ?? 0;
    if ((current?.localRevision ?? 0) !== expectedLocalRevision ||
        (channelRevision !== undefined && channelRevision <= previousRevision)) throw new LocalizedError(msg('catalogActivationConflict'));
    if (current && current.compatibilityId !== manifest.compatibilityId) {
      const previous = await readRequest<InstalledCatalog | undefined>(catalogs.get(current.compatibilityId));
      if (previous) catalogs.put({ ...previous, state: 'retained' });
    }
    for (const [hash, bytes] of artifacts) blobs.put(bytes, [manifest.compatibilityId, hash]);
    catalogs.put({ compatibilityId: manifest.compatibilityId, state: 'active', manifest, installedAt: new Date().toISOString() });
    const pointer: LocalCatalogPointer = {
      compatibilityId: manifest.compatibilityId,
      previousId: current?.compatibilityId === manifest.compatibilityId ? current.previousId : current?.compatibilityId,
      localRevision: expectedLocalRevision + 1,
      channelRevision: channelRevision ?? previousRevision,
    };
    pointers.put(pointer, 'active');
    return pointer;
  });
}

export async function verifyInstalledFiles(manifest: FrozenRelease): Promise<void> {
  await transact('artifacts', 'readonly', async transaction => {
    const store = transaction.objectStore('artifacts');
    const keys = await Promise.all(manifest.files.map(file => readRequest(store.getKey([manifest.compatibilityId, file.sha256]))));
    if (keys.some(key => key === undefined)) throw new LocalizedError(msg('localCatalogIsIncomplete'));
  });
}

export function readCatalogArtifact(manifest: FrozenRelease, purpose: 'index'): Promise<CatalogIndex>;
export function readCatalogArtifact(manifest: FrozenRelease, purpose: 'dogma'): Promise<DogmaDataset>;
export function readCatalogArtifact(manifest: FrozenRelease, purpose: 'types', segment: string): Promise<TypeSegment>;
export async function readCatalogArtifact(manifest: FrozenRelease, purpose: Artifact['purpose'], segment?: string) {
  const file = manifest.files.find(entry => entry.purpose === purpose && entry.segment === segment);
  if (!file) throw new LocalizedError(msg('missingCatalogArtifact', purpose));
  const bytes = await transact('artifacts', 'readonly', transaction =>
    readRequest<ArrayBuffer | undefined>(transaction.objectStore('artifacts').get([manifest.compatibilityId, file.sha256])));
  if (!bytes) throw new LocalizedError(msg('localCatalogArtifactIsMissing'));
  await verifyArtifact(file, bytes);
  return decodeArtifact(manifest, file, bytes);
}
