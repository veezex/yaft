import { LocalizedError, msg } from '../i18n/index.ts';
import type { LocalizedNames } from '../i18n/index.ts';
import type {
  SdeAttribute, SdeCategory, SdeCloneGrade, SdeDbuffCollection, SdeDynamicAttribute,
  SdeEffect, SdeGroup, SdeMarketGroup, SdeMetaGroup, SdeType, SdeUnit,
} from 'eve-fit-engine';
import type { CatalogType, FrozenRelease } from '../storage/catalog-contract.ts';

export interface CatalogIndex {
  releaseId: string;
  types: CatalogType[];
}

export interface TypeSegment {
  releaseId: string;
  types: SdeType[];
}

export interface CatalogLabels {
  groups: Partial<Record<number, LocalizedNames>>;
  categories: Partial<Record<number, LocalizedNames>>;
  attributes: Partial<Record<number, LocalizedNames>>;
  units: Partial<Record<number, LocalizedNames>>;
}

export interface DogmaDataset {
  releaseId: string;
  localizedLabels?: CatalogLabels;
  attributes: SdeAttribute[];
  units: SdeUnit[];
  effects: SdeEffect[];
  categories: SdeCategory[];
  groups: SdeGroup[];
  metaGroups: SdeMetaGroup[];
  marketGroups: SdeMarketGroup[];
  cloneGrades: SdeCloneGrade[];
  dbuffCollections: SdeDbuffCollection[];
  dynamicAttributes: SdeDynamicAttribute[];
  bonuses: unknown[];
  fighterAbilities: unknown[];
  fighterAbilitiesByType: unknown[];
  systemWideEffects: unknown[];
  systemDbuffEmitters: unknown[];
}

export function verifyDatasetRelease(release: FrozenRelease, data: { releaseId: string }): void {
  if (data?.releaseId !== release.sdeReleaseId) throw new LocalizedError(msg('artifactContainsDataFromA'));
}
