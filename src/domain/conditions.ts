import { LocalizedError, msg } from '../i18n/index.ts';
import type { Fit } from './fit.ts';
import type { SkillProfile } from './skills.ts';

export const damageTypes = ['em', 'thermal', 'kinetic', 'explosive'] as const;
export type DamageMix = Record<(typeof damageTypes)[number], number>;

export interface FitConditions {
  id: string;
  damage: DamageMix;
  target?: {
    signatureMeters: number;
    velocityMetersPerSecond: number;
    angularRadiansPerSecond?: number;
    distanceMeters: number;
    resistances: DamageMix;
  };
  environmentTypeId?: number;
  implants: { typeId: number; slot: number }[];
  boosters: { typeId: number; slot: number; sideEffects: number[] }[];
  sources: { snapshotId: string; kind: 'projected' | 'command' }[];
}

export interface EffectSnapshot {
  id: string;
  fit: Fit;
  profile: SkillProfile;
  conditions?: FitConditions;
}

export function normalizeDamage(mix: DamageMix): DamageMix {
  const weights = damageTypes.map(type => mix[type]);
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (weights.some(value => !Number.isFinite(value) || value < 0) || !Number.isFinite(total) || total <= 0) {
    throw new LocalizedError(msg('invalidDamageWeights'));
  }
  return { em: mix.em / total, thermal: mix.thermal / total, kinetic: mix.kinetic / total, explosive: mix.explosive / total };
}

function checkTarget(target: NonNullable<FitConditions['target']>): void {
  const ranges = [
    [msg('signatureM'), target.signatureMeters, 0.01, 1e8],
    [msg('velocityMS'), target.velocityMetersPerSecond, 0, 1e8],
    [msg('angularVelocity'), target.angularRadiansPerSecond ?? 0, 0, 1e4],
    [msg('distanceM'), target.distanceMeters, 0, 1e10],
    ...damageTypes.map(type => [msg('damageResistance', type), target.resistances[type], 0, 1] as const),
  ] as const;
  for (const [field, value, min, max] of ranges) {
    if (!Number.isFinite(value) || value < min || value > max) throw new LocalizedError(msg('numberOutsideRange', field, min, max));
  }
}

export function validateConditions(conditions: FitConditions, snapshots: ReadonlyMap<string, EffectSnapshot>): FitConditions {
  const visiting = new Set<string>();
  const checked = new Set<string>();
  function visit(current: FitConditions): void {
    normalizeDamage(current.damage);
    if (current.target) checkTarget(current.target);
    for (const { snapshotId } of current.sources) {
      if (visiting.has(snapshotId)) throw new LocalizedError(msg('externalFitCycle', snapshotId));
      if (checked.has(snapshotId)) continue;
      const source = snapshots.get(snapshotId);
      if (!source || source.profile.id !== source.fit.skillProfileId ||
          (source.fit.conditionsId && source.conditions?.id !== source.fit.conditionsId)) {
        throw new LocalizedError(msg('unresolvedExternalFit', snapshotId));
      }
      visiting.add(snapshotId);
      if (source.conditions) visit(source.conditions);
      visiting.delete(snapshotId);
      checked.add(snapshotId);
    }
  }
  visit(conditions);
  return { ...conditions, damage: normalizeDamage(conditions.damage) };
}
