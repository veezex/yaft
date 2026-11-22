import { LocalizedError, msg } from '../i18n/index.ts';
import type { LocalizedNames } from '../i18n/index.ts';
export const datasetSchemaVersion = 1;
export const engineProtocolVersion = 1;
export const enginePackageVersion = '0.2.28';
// Identifies the pinned engine and the version of its input mapping.
export const engineRulesVersion = 'eve-fit-engine@0.2.28+yaft.1';
export const referencePyfa = { tag: 'v2.70.0', commit: 'e5483f8666ed2eda99c98985c59a29b07e3bb844' } as const;

export interface CatalogType {
  typeId: number;
  names: Record<string, string>;
  groupId: number;
  categoryId: number;
  category: string;
  group: string;
  categoryNames?: LocalizedNames;
  groupNames?: LocalizedNames;
  segment: string;
  published: boolean;
  marketGroupId?: number;
  metaGroupId?: number;
  volume?: number;
  slot?: 'high' | 'mid' | 'low' | 'rig' | 'subsystem' | 'service';
}

export interface Artifact {
  purpose: 'index' | 'dogma' | 'types';
  segment?: string;
  url: string;
  encoding: 'gzip' | 'identity';
  bytes: number;
  sha256: string;
}

export interface CompatibilityRelease {
  formatVersion: 1;
  compatibilityId: string;
  sdeReleaseId: string;
  sdeBuildNumber: number;
  datasetSchemaVersion: number;
  engineProtocolVersion: number;
  engineRulesVersion: string;
  enginePackageVersion: string;
  localizedLabelsVersion?: 1;
  pyfa: { tag: string; commit: string };
  provenance: { source: string; releaseDate: string; manifestSha256: string; datasetSha256: string };
  files: Artifact[];
}

export interface ReleaseReference {
  compatibilityId: string;
  url: string;
  sha256: string;
}

export interface ChannelPointer {
  formatVersion: 1;
  revision: number;
  publishedAt: string;
  current: ReleaseReference;
  previous?: ReleaseReference;
}

export interface InstalledCatalog {
  compatibilityId: string;
  state: 'staging' | 'verified' | 'active' | 'retained' | 'failed';
  manifest: CompatibilityRelease;
  installedAt: string;
}

export const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const isIdentifier = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,95}$/i.test(value);
export const isReleaseId = (value: unknown): value is string => typeof value === 'string' && /^\d{8}T\d{6}Z$/.test(value);
export const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isString = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());

export function parseRelease(value: unknown): FrozenRelease {
  if (!isRecord(value) || value.formatVersion !== 1 || !isIdentifier(value.compatibilityId) ||
      !isReleaseId(value.sdeReleaseId) || !Number.isSafeInteger(value.sdeBuildNumber) || Number(value.sdeBuildNumber) < 1 ||
      value.datasetSchemaVersion !== datasetSchemaVersion || value.engineProtocolVersion !== engineProtocolVersion ||
      value.engineRulesVersion !== engineRulesVersion || value.enginePackageVersion !== enginePackageVersion ||
      (value.localizedLabelsVersion !== undefined && value.localizedLabelsVersion !== 1) ||
      !isRecord(value.pyfa) || !isString(value.pyfa.tag) || typeof value.pyfa.commit !== 'string' || !/^[a-f0-9]{40}$/.test(value.pyfa.commit) ||
      !isRecord(value.provenance) || !isString(value.provenance.source) || !isDate(value.provenance.releaseDate) ||
      !isSha256(value.provenance.manifestSha256) || !isSha256(value.provenance.datasetSha256) || !Array.isArray(value.files)) {
    throw new LocalizedError(msg('incompatibleOrMalformedCatalogManifest'));
  }

  const roles = new Set<string>();
  const files = value.files.map((entry: unknown) => {
    if (!isRecord(entry) || !['index', 'dogma', 'types'].includes(String(entry.purpose)) ||
        (entry.purpose === 'types' ? !isIdentifier(entry.segment) : entry.segment !== undefined) ||
        !isSha256(entry.sha256) || !Number.isSafeInteger(entry.bytes) || Number(entry.bytes) <= 0 ||
        (entry.encoding !== 'gzip' && entry.encoding !== 'identity') ||
        !isString(entry.url) || !new RegExp(`^blobs/${entry.sha256}\\.(?:json|blob)$`).test(entry.url)) {
      throw new LocalizedError(msg('invalidCatalogArtifact'));
    }
    const role = entry.segment ? `types:${entry.segment}` : String(entry.purpose);
    if (roles.has(role)) throw new LocalizedError(msg('duplicateCatalogArtifact', role));
    roles.add(role);
    return Object.freeze({ ...entry }) as unknown as Readonly<Artifact>;
  });
  if (!roles.has('index') || !roles.has('dogma') || !files.some(file => file.purpose === 'types')) {
    throw new LocalizedError(msg('requiredCatalogArtifactsAreMissing'));
  }
  return Object.freeze({
    ...value, pyfa: Object.freeze({ ...value.pyfa }), provenance: Object.freeze({ ...value.provenance }),
    files: Object.freeze(files),
  }) as unknown as FrozenRelease;
}

export type FrozenRelease = Readonly<Omit<CompatibilityRelease, 'files' | 'pyfa' | 'provenance'>> & {
  readonly files: readonly Readonly<Artifact>[];
  readonly pyfa: Readonly<CompatibilityRelease['pyfa']>;
  readonly provenance: Readonly<CompatibilityRelease['provenance']>;
};

function isReleaseReference(value: unknown): value is ReleaseReference {
  return isRecord(value) && isIdentifier(value.compatibilityId) && isSha256(value.sha256) &&
    isString(value.url) && value.url.endsWith(`/releases/${value.compatibilityId}/manifest.json`);
}

export function parseChannelPointer(value: unknown): ChannelPointer {
  if (!isRecord(value) || value.formatVersion !== 1 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
      !isDate(value.publishedAt) || !isReleaseReference(value.current) ||
      (value.previous !== undefined && !isReleaseReference(value.previous))) {
    throw new LocalizedError(msg('malformedCatalogChannelPointer'));
  }
  return value as unknown as ChannelPointer;
}

export async function verifyArtifact(file: { bytes?: number; sha256: string }, bytes: ArrayBuffer): Promise<void> {
  if (file.bytes !== undefined && file.bytes !== bytes.byteLength) throw new LocalizedError(msg('catalogArtifactSizeMismatch'));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (Array.from(digest, value => value.toString(16).padStart(2, '0')).join('') !== file.sha256) {
    throw new LocalizedError(msg('catalogArtifactSha256Mismatch'));
  }
}
