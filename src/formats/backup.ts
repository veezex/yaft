import { LocalizedError, msg } from '../i18n/index.ts';
import type { Fit, FitItem, TypeReference } from '../domain/fit.ts';
import { isTypeId, itemGroups, moduleStates } from '../domain/fit.ts';
import { isSkillLevel, presetSkills } from '../domain/skills.ts';
import type { SkillProfile } from '../domain/skills.ts';
import { normalizeDamage } from '../domain/conditions.ts';
import type { FitConditions } from '../domain/conditions.ts';
import type { LibraryData, Settings } from '../storage/library.ts';
import { isRecord } from '../storage/catalog-contract.ts';

export interface Backup extends LibraryData {
  formatVersion: 1;
}

function cleanReference(value: unknown): TypeReference {
  if (!isRecord(value) || (!isTypeId(value.typeId) && typeof value.unknownSource !== 'string')) throw new LocalizedError(msg('invalidFitTypeReference'));
  return { typeId: isTypeId(value.typeId) ? value.typeId : undefined,
    unknownSource: typeof value.unknownSource === 'string' ? value.unknownSource : undefined };
}

function cleanItem(value: unknown): FitItem {
  if (!isRecord(value) || typeof value.id !== 'string' || !isTypeId(value.quantity) ||
      !itemGroups.includes(value.group as FitItem['group']) ||
      (value.state !== undefined && !moduleStates.includes(value.state as NonNullable<FitItem['state']>))) throw new LocalizedError(msg('invalidFitItem'));
  const { id, group, position, quantity, state, activeQuantity, fighterAbilities, abyssal } = value;
  return {
    ...cleanReference(value), id, group, position, quantity, state, activeQuantity,
    charge: value.charge && cleanReference(value.charge),
    fighterAbilities: isRecord(fighterAbilities) ? Object.fromEntries(Object.entries(fighterAbilities)
      .filter(([key, enabled]) => isTypeId(Number(key)) && typeof enabled === 'boolean')) : undefined,
    abyssal: isRecord(abyssal) ? {
      mutaplasmidTypeId: abyssal.mutaplasmidTypeId, sourceTypeId: abyssal.sourceTypeId,
      attributes: isRecord(abyssal.attributes) ? Object.fromEntries(Object.entries(abyssal.attributes)
        .filter(([id, v]) => isTypeId(Number(id)) && Number.isFinite(v))) : {},
    } : undefined,
  } as FitItem;
}

export function cleanFit(value: unknown): Fit {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' ||
      !value.name.trim() || typeof value.description !== 'string' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0 ||
      !isTypeId(value.shipTypeId) || (value.modeTypeId !== undefined && !isTypeId(value.modeTypeId)) ||
      typeof value.skillProfileId !== 'string' || (value.conditionsId !== undefined && typeof value.conditionsId !== 'string') ||
      !['draft', 'saved'].includes(String(value.status)) || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string' ||
      !Array.isArray(value.items)) throw new LocalizedError(msg('invalidFitInBackup'));
  const { id, revision, name, description, shipTypeId, modeTypeId, skillProfileId, conditionsId, status, createdAt, updatedAt } = value;
  return { id, revision, name, description, shipTypeId, modeTypeId, skillProfileId, conditionsId, status, createdAt, updatedAt,
    items: value.items.map(cleanItem) } as Fit;
}

function levels(value: unknown): SkillProfile['levels'] {
  if (!isRecord(value)) throw new LocalizedError(msg('invalidSkillLevels'));
  for (const [id, level] of Object.entries(value)) if (!isTypeId(Number(id)) || !isSkillLevel(level)) throw new LocalizedError(msg('invalidSkillLevel'));
  return value as SkillProfile['levels'];
}

function cleanProfile(value: unknown): SkillProfile {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string' ||
      (value.source !== 'custom' && value.source !== 'eve') || Object.hasOwn(presetSkills, value.id)) {
    throw new LocalizedError(msg('invalidSkillProfileInBackup'));
  }
  return { id: value.id, name: value.name, source: value.source, levels: levels(value.levels),
    trainedLevels: value.trainedLevels === undefined ? undefined : levels(value.trainedLevels),
    characterId: isTypeId(value.characterId) ? value.characterId : undefined,
    fetchedAt: typeof value.fetchedAt === 'string' ? value.fetchedAt : undefined,
  };
}

function cleanConditions(value: unknown): FitConditions {
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.damage) ||
      !Array.isArray(value.implants) || !Array.isArray(value.boosters) || !Array.isArray(value.sources)) throw new LocalizedError(msg('invalidConditions'));
  const cleanMix = (damage: Record<string, unknown>) => ({
    em: Number(damage.em), thermal: Number(damage.thermal), kinetic: Number(damage.kinetic), explosive: Number(damage.explosive),
  });
  const damage = cleanMix(value.damage);
  normalizeDamage(damage);
  const target = isRecord(value.target) && isRecord(value.target.resistances) ? {
    signatureMeters: Number(value.target.signatureMeters), velocityMetersPerSecond: Number(value.target.velocityMetersPerSecond),
    angularRadiansPerSecond: value.target.angularRadiansPerSecond === undefined ? undefined : Number(value.target.angularRadiansPerSecond),
    distanceMeters: Number(value.target.distanceMeters), resistances: cleanMix(value.target.resistances),
  } : undefined;
  return {
    id: value.id, damage, target, environmentTypeId: isTypeId(value.environmentTypeId) ? value.environmentTypeId : undefined,
    implants: value.implants.map(({ typeId, slot }) => ({ typeId, slot })),
    boosters: value.boosters.map(({ typeId, slot, sideEffects }) => ({ typeId, slot, sideEffects })),
    sources: value.sources.map(({ snapshotId, kind }) => ({ snapshotId, kind })),
  };
}

function cleanSettings(value: unknown): Settings {
  if (!isRecord(value) || value.formatVersion !== 1) throw new LocalizedError(msg('unsupportedSettingsVersion'));
  return { formatVersion: 1, activeFitId: typeof value.activeFitId === 'string' ? value.activeFitId : undefined,
    exportFormat: ['eft', 'xml', 'dna', 'json'].includes(String(value.exportFormat)) ? value.exportFormat : undefined,
    editorPanel: ['catalog', 'editor', 'stats'].includes(String(value.editorPanel)) ? value.editorPanel : undefined,
  } as Settings;
}

function backup(value: unknown): Backup {
  if (!isRecord(value) || value.formatVersion !== 1) throw new LocalizedError(msg('unsupportedBackupFormatVersion'));
  if (!Array.isArray(value.fits) || !Array.isArray(value.profiles) || !Array.isArray(value.conditions)) throw new LocalizedError(msg('invalidBackupContents'));
  const fits = value.fits.map(cleanFit);
  const profiles = value.profiles.map(cleanProfile);
  const conditions = value.conditions.map(cleanConditions);
  const settings = cleanSettings(value.settings);
  for (const records of [fits, profiles, conditions]) {
    if (new Set(records.map(record => record.id)).size !== records.length) throw new LocalizedError(msg('duplicateRecordIdInBackup'));
  }
  const profileIds = new Set([...Object.keys(presetSkills), ...profiles.map(profile => profile.id)]);
  const conditionIds = new Set(conditions.map(condition => condition.id));
  if (fits.some(fit => !profileIds.has(fit.skillProfileId) || (fit.conditionsId !== undefined && !conditionIds.has(fit.conditionsId))) ||
      (settings.activeFitId && !fits.some(fit => fit.id === settings.activeFitId))) {
    throw new LocalizedError(msg('backupHasAnUnresolvedRecord'));
  }
  return { formatVersion: 1, fits, profiles, conditions, settings };
}

export function encodeBackup(data: LibraryData): string {
  return JSON.stringify(backup({ ...data, formatVersion: 1 }), null, 2) + '\n';
}

export function decodeBackup(text: string): Backup {
  let contents: unknown;
  try {
    contents = JSON.parse(text) as unknown;
  } catch {
    throw new LocalizedError(msg('invalidBackupContents'));
  }
  return backup(contents);
}
