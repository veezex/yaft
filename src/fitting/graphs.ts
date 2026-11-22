import { effectiveDps } from 'eve-fit-engine';
import type { TargetProfile, WeaponContribution } from 'eve-fit-engine';
import type { FitConditions } from '../domain/conditions.ts';
import type { CalculationResult } from './worker-protocol.ts';

type Target = NonNullable<FitConditions['target']>;
export function engineTarget(target: Target, distance = target.distanceMeters): TargetProfile {
  return {
    name: 'Target', signatureRadius: target.signatureMeters,
    maxVelocity: target.angularRadiansPerSecond === undefined ? target.velocityMetersPerSecond : target.angularRadiansPerSecond * distance,
    emResist: target.resistances.em, thermalResist: target.resistances.thermal,
    kineticResist: target.resistances.kinetic, explosiveResist: target.resistances.explosive,
  };
}

export function appliedDps(weapons: WeaponContribution[], target: Target, distance: number): number {
  return weapons.reduce((total, weapon) => {
    const { damages } = weapon;
    if (!damages.total || (weapon.kind === 'MISSILE' && weapon.range.flightRange > 0 && distance > weapon.range.flightRange)) return total;
    const resisted = (damages.em * target.resistances.em + damages.thermal * target.resistances.thermal +
      damages.kinetic * target.resistances.kinetic + damages.explosive * target.resistances.explosive) / damages.total;
    return total + effectiveDps(weapon, engineTarget(target, distance), distance) * (1 - resisted);
  }, 0);
}

export function calculationGraphs(weapons: WeaponContribution[], target: Target | undefined, partial: boolean): CalculationResult['graphs'] {
  const maxRange = Math.max(10_000, (target?.distanceMeters ?? 0) * 2,
    ...weapons.map(weapon => Math.max(weapon.range.optimal + 3 * weapon.range.falloff, weapon.range.flightRange, weapon.range.burstRange)));
  return [{
    key: 'appliedDps', status: !target ? 'not-applicable' : partial ? 'partial' : 'computed',
    points: target ? Array.from({ length: 41 }, (_, index) => {
      const x = maxRange * index / 40;
      return { x, y: appliedDps(weapons, target, x) };
    }) : [],
  }, {
    key: 'capacitorTimeline', status: 'unavailable', points: [],
  }];
}
