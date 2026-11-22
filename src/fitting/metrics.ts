import { msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import type { ComputedFit, FittingDataset } from 'eve-fit-engine';
import type { Metric } from './worker-protocol.ts';

export function fitMetrics({ derived, modules }: ComputedFit, partial: boolean, dataset: FittingDataset): Metric[] {
  const { fitting, defense, offense, capacitor, navigation, targeting, tank } = derived;
  const metrics: Metric[] = [];
  function add(key: string, label: Text, unit: string, value: number | boolean | undefined, applicable = true): void {
    const available = typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
    metrics.push({
      key, label, unit,
      status: !applicable ? 'not-applicable' : partial ? 'partial' : available ? 'computed' : 'unavailable',
      value: applicable && available ? value : undefined,
    });
  }
  add('cpuUsed', msg('cpuUsed'), 'tf', fitting.cpuUsed);
  add('cpuMax', msg('cpuCapacity'), 'tf', fitting.cpuMax);
  add('powerUsed', msg('powergridUsed'), 'MW', fitting.powerUsed);
  add('powerMax', msg('powergridCapacity'), 'MW', fitting.powerMax);
  add('calibrationUsed', msg('calibrationUsed'), 'pt', fitting.calibrationUsed);
  add('calibrationMax', msg('calibrationCapacity'), 'pt', fitting.calibrationMax);
  for (const [slot, { used, max }] of Object.entries(fitting.slots)) {
    add(`slot.${slot}.used`, msg('slotsUsed', slot), '', used);
    add(`slot.${slot}.max`, msg('slotsAvailable', slot), '', max);
  }
  for (const [kind, { used, max }] of Object.entries(fitting.hardpoints)) {
    add(`hardpoint.${kind}.used`, msg('hardpointsUsed', kind), '', used);
    add(`hardpoint.${kind}.max`, msg('hardpointsAvailable', kind), '', max);
  }
  add('droneBayUsed', msg('droneBayUsed'), 'm³', fitting.droneBayUsed);
  add('droneBayMax', msg('droneBayCapacity'), 'm³', fitting.droneBayMax);
  add('droneBandwidthUsed', msg('droneBandwidthUsed'), 'Mbit/s', fitting.droneBandwidthUsed);
  add('droneBandwidthMax', msg('droneBandwidthCapacity'), 'Mbit/s', fitting.droneBandwidthMax);
  add('weaponDps', msg('weaponDamage'), 'DPS', offense.weaponDps);
  add('droneDps', msg('droneDamage'), 'DPS', offense.droneDps);
  add('totalDps', msg('totalDamage'), 'DPS', offense.totalDps);
  add('sustainedDps', msg('sustainedDamage'), 'DPS', offense.totalSustainedDps);
  add('alphaStrike', msg('volleyDamage'), 'HP', offense.alphaStrike);
  const hasWeapons = offense.breakdown.some(weapon => weapon.kind !== 'DRONE');
  add('weaponOptimal', msg('weaponOptimal'), 'm', offense.weaponOptimal, hasWeapons);
  add('weaponFalloff', msg('weaponFalloff'), 'm', offense.weaponFalloff, hasWeapons);
  for (const layer of ['shield', 'armor', 'hull'] as const) {
    add(`${layer}Hp`, msg('layerHitPoints', layer), 'HP', defense[layer].hp);
    for (const [damage, resist] of Object.entries(defense[layer].resistances)) {
      add(`${layer}.${damage}`, msg('layerResistance', layer, damage), '%', resist * 100);
    }
  }
  add('ehpTotal', msg('effectiveHitPoints'), 'EHP', defense.ehpTotalAgainstProfile);
  add('shieldRepair', msg('shieldBoost'), 'HP/s', tank.shieldRepairPerSecondSustained);
  add('armorRepair', msg('armorRepair'), 'HP/s', tank.armorRepairPerSecondSustained);
  add('hullRepair', msg('hullRepair'), 'HP/s', tank.hullRepairPerSecondSustained);
  add('shieldRecharge', msg('peakShieldRecharge'), 'HP/s', tank.passiveShieldRegenPeak);
  add('capacitor', msg('capacitorCapacity'), 'GJ', capacitor.capacity);
  add('capacitorStable', msg('capacitorStable'), '', capacitor.stable);
  add('capacitorLevel', msg('stableCapacitorLevel'), '%', capacitor.stablePercent * 100, capacitor.stable);
  add('capacitorTime', msg('timeToEmpty'), 's', capacitor.secondsToEmpty, !capacitor.stable);
  add('capacitorUse', msg('capacitorUse'), 'GJ/s', capacitor.usagePerSecond);
  add('velocity', msg('maximumVelocity'), 'm/s', navigation.maxVelocity);
  add('align', msg('alignTime'), 's', navigation.alignTimeSeconds);
  add('warpSpeed', msg('warpSpeed'), 'AU/s', navigation.warpSpeed);
  add('lockRange', msg('targetingRange'), 'm', targeting.maxTargetingRange);
  add('targets', msg('maximumTargets'), '', targeting.maxLockedTargets);
  add('scanResolution', msg('scanResolution'), 'mm', targeting.scanResolution);
  add('signature', msg('signatureRadius'), 'm', targeting.signatureRadius);
  add('sensorStrength', msg('sensorStrength'), '', targeting.sensorStrength);
  const rates = [
    { key: 'mining', label: msg('miningYield'), unit: 'm³/min', effects: [17, 67, 2726], attribute: 77, ms: 60_000 },
    { key: 'remoteShield', label: msg('remoteShieldBoost'), unit: 'HP/s', effects: [18, 6186], attribute: 68, ms: 1_000 },
    { key: 'remoteArmor', label: msg('remoteArmorRepair'), unit: 'HP/s', effects: [592, 6188], attribute: 84, ms: 1_000 },
    { key: 'remoteHull', label: msg('remoteHullRepair'), unit: 'HP/s', effects: [6185], attribute: 83, ms: 1_000 },
    { key: 'remoteCapacitor', label: msg('remoteCapacitorTransfer'), unit: 'GJ/s', effects: [6184], attribute: 90, ms: 1_000 },
  ];
  for (const rate of rates) {
    let total = 0;
    let applicable = false;
    for (const module of modules.values()) {
      const effect = dataset.getType(module.typeID)?.effects.find(effect => rate.effects.includes(effect.id));
      if (!effect) continue;
      applicable = true;
      if (module.state !== 'ACTIVE' && module.state !== 'OVERLOAD') continue;
      const cycleAttr = dataset.effects.get(effect.id)?.durationAttributeID;
      const duration = cycleAttr && module.attributes.get(cycleAttr)?.final;
      if (duration && duration > 0) {
        const amount = module.attributes.get(rate.attribute)?.final ?? 0;
        const crit = rate.key === 'mining'
          ? (module.attributes.get(5967)?.final ?? 0) * (module.attributes.get(5969)?.final ?? 0)
          : 0;
        total += amount * (1 + crit) * rate.ms / duration;
      }
    }
    add(rate.key, rate.label, rate.unit, total, applicable);
  }
  return metrics;
}
