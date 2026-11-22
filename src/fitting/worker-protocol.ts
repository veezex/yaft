import { LocalizedError, msg } from '../i18n/index.ts';
import type { LocalizedNames, Text } from '../i18n/index.ts';
import type { EffectSnapshot, FitConditions } from '../domain/conditions.ts';
import type { Fit } from '../domain/fit.ts';
import { isTypeId } from '../domain/fit.ts';
import type { SkillProfile } from '../domain/skills.ts';
import { isRecord } from '../storage/catalog-contract.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';

interface RequestIdentity {
  requestId: string;
  compatibilityId: string;
}
export interface InitializeRequest extends RequestIdentity { kind: 'initialize' }
export interface SearchRequest extends RequestIdentity {
  kind: 'search';
  query: string;
  offset: number;
  limit: number;
  categoryIds?: number[];
  typeIds?: number[];
  exactNames?: string[];
  groupIds?: number[];
  moduleTypeId?: number;
  includeAttributes?: boolean;
  includeUnpublished?: boolean;
}
interface ValidateEquipmentRequest extends RequestIdentity {
  kind: 'validate-equipment';
  hullTypeId: number;
  typeId: number;
}
export interface CalculateRequest extends RequestIdentity {
  kind: 'calculate';
  fitRevision: number;
  fit: Fit;
  profile: SkillProfile;
  conditions?: FitConditions;
  snapshots?: EffectSnapshot[];
}
export type WorkerRequest = InitializeRequest | SearchRequest | ValidateEquipmentRequest | CalculateRequest;
export type MetricStatus = 'computed' | 'partial' | 'unavailable' | 'not-applicable';
export interface Metric {
  key: string;
  label: Text;
  unit: string;
  status: MetricStatus;
  value?: number | boolean;
}

export interface CalculationResult extends RequestIdentity {
  fitRevision: number;
  hullModes: { typeId: number; name: string; names: LocalizedNames }[];
  chargeableTypeIds: number[];
  activeDrones: Record<string, number>;
  metrics: Metric[];
  warnings: { message: Text; itemId?: string; code: string }[];
  graphs: { key: string; points: { x: number; y: number }[]; status: MetricStatus }[];
}
export interface CatalogAttribute {
  name: string;
  names?: LocalizedNames;
  value: number;
  unit?: string;
  unitNames?: LocalizedNames;
}

export type WorkerResponse =
  | (RequestIdentity & { kind: 'initialize'; engineRulesVersion: string })
  | (RequestIdentity & { kind: 'search'; results: CatalogType[]; nextOffset: number | null; attributes?: Record<number, CatalogAttribute[]> })
  | (RequestIdentity & { kind: 'validate-equipment'; warning?: Text })
  | (CalculationResult & { kind: 'calculate' })
  | (RequestIdentity & { kind: 'error'; message: Text });

export function parseWorkerRequest(value: unknown): WorkerRequest {
  if (!isRecord(value) || typeof value.requestId !== 'string' || !value.requestId ||
      typeof value.compatibilityId !== 'string' || !value.compatibilityId) throw new LocalizedError(msg('invalidWorkerRequestIdentity'));
  switch (value.kind) {
    case 'initialize': break;
    case 'search':
      if (typeof value.query !== 'string' || !Number.isSafeInteger(value.offset) || Number(value.offset) < 0 ||
          !Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 100 ||
          (value.moduleTypeId !== undefined && !isTypeId(value.moduleTypeId)) ||
          (value.categoryIds !== undefined && (!Array.isArray(value.categoryIds) ||
            value.categoryIds.some(id => !Number.isSafeInteger(id) || id < 0)))) throw new LocalizedError(msg('invalidSearchRequest'));
      break;
    case 'validate-equipment':
      if (!isTypeId(value.hullTypeId) || !isTypeId(value.typeId)) throw new LocalizedError(msg('invalidEquipmentValidationRequest'));
      break;
    case 'calculate':
      if (!Number.isSafeInteger(value.fitRevision) || Number(value.fitRevision) < 0 ||
          !isRecord(value.fit) || !isRecord(value.profile)) throw new LocalizedError(msg('invalidCalculateRequest'));
      break;
    default: throw new LocalizedError(msg('unknownWorkerRequest'));
  }
  return value as unknown as WorkerRequest;
}

type CalculationIdentity = RequestIdentity & { fitRevision: number };
export function isCurrentCalculation(response: CalculationIdentity, current: CalculationIdentity): boolean {
  return response.requestId === current.requestId && response.compatibilityId === current.compatibilityId &&
    response.fitRevision === current.fitRevision;
}
