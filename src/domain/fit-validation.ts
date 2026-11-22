import { msg, nameText } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { ATTR, isOverloadableModule, moduleAcceptsChargeType } from 'eve-fit-engine';
import type { FittingDataset, SdeType } from 'eve-fit-engine';
import type { Fit, FitItem } from './fit.ts';
import type { SkillProfile } from './skills.ts';
import { skillLevel } from './skills.ts';
import type { CalculationResult } from '../fitting/worker-protocol.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';

type Warning = CalculationResult['warnings'][number];
interface FitResources {
  cpuUsed: number; cpuMax: number;
  powerUsed: number; powerMax: number;
  calibrationUsed: number; calibrationMax: number;
  droneBandwidthUsed: number; droneBandwidthMax: number;
  droneBayUsed: number; droneBayMax: number;
  slots: Record<string, { used: number; max: number }>;
  hardpoints: Record<string, { used: number; max: number }>;
}

export const attribute = (type: SdeType, id: number) => type.attributes.find(attr => attr.id === id)?.v;
const requiredSkills = [[182, 277], [183, 278], [184, 279], [1285, 1286], [1289, 1287], [1290, 1288]] as const;

export function acceptsModuleCharge(module: SdeType, charge: SdeType): boolean {
  if (charge.categoryID !== 8 || !moduleAcceptsChargeType(module, charge)) return false;
  const moduleSize = attribute(module, ATTR.CHARGE_SIZE);
  const chargeSize = attribute(charge, ATTR.CHARGE_SIZE);
  if (moduleSize && chargeSize && moduleSize !== chargeSize) return false;
  return module.capacity === undefined || charge.volume === undefined || charge.volume <= module.capacity;
}

export function hullCompatibilityWarnings(
  hull: SdeType, item: SdeType, rig: boolean, attributes: FittingDataset['attributes'], name: Text = item.name ?? String(item.id),
): Warning[] {
  const warnings: Warning[] = [];
  const warn = (code: string, reason: Text) => {
    warnings.push({ code, message: msg('itemWarning', name, reason) });
  };
  let restricted = false;
  let matchesHull = false;
  for (const { id, v } of item.attributes) {
    if (!v) continue;
    const name = attributes.get(id)?.name;
    if (name?.startsWith('canFitShipGroup')) {
      restricted = true;
      if (v === hull.groupID) matchesHull = true;
    } else if (id === 1380 || name?.startsWith('canFitShipType')) {
      restricted = true;
      if (v === hull.id) matchesHull = true;
    }
  }
  if (restricted && !matchesHull) warn('hull-restriction', msg('requiresADifferentHull'));
  if (rig && attribute(item, 1547) !== attribute(hull, 1547)) warn('rig-size', msg('rigSizeDiffersFromThe'));
  return warnings;
}

export function activeDroneLimit(profile: SkillProfile, ship: ReadonlyMap<number, { final: number }>): number {
  const limit = ship.get(352)?.final || (skillLevel(profile, 3436) + (ship.get(353)?.final ?? 0));
  return Math.max(0, Math.floor(limit));
}

export function resourceWarnings(fitting: FitResources): Warning[] {
  const limits: [string, Text, number, number][] = [
    ['resource-cpu', msg('cpu'), fitting.cpuUsed, fitting.cpuMax],
    ['resource-power', msg('powergrid'), fitting.powerUsed, fitting.powerMax],
    ['resource-calibration', msg('calibration'), fitting.calibrationUsed, fitting.calibrationMax],
    ['resource-drone-bandwidth', msg('droneBandwidth'), fitting.droneBandwidthUsed, fitting.droneBandwidthMax],
    ['resource-drone-bay', msg('droneBay'), fitting.droneBayUsed, fitting.droneBayMax],
    ...Object.entries(fitting.slots).map(([slot, n]): [string, Text, number, number] =>
      [`slots-${slot}`, msg('slotResourceLabel', slot), n.used, n.max]),
    ...Object.entries(fitting.hardpoints).map(([kind, n]): [string, Text, number, number] =>
      [`hardpoints-${kind}`, msg('hardpointResourceLabel', kind), n.used, n.max]),
  ];
  return limits.flatMap(([code, label, used, max]) =>
    used > max + 1e-8 ? [{ code, message: msg('resourceLimitExceeded', label, Number(used.toFixed(2)), Number(max.toFixed(2))) }] : []);
}

export function equipmentWarnings(
  fit: Fit, dataset: FittingDataset, entries: ReadonlyMap<number, CatalogType>, profile: SkillProfile,
  shipValues: ReadonlyMap<number, { final: number }>, activeDrones: number,
): Warning[] {
  const warnings: Warning[] = [];
  const ship = dataset.getType(fit.shipTypeId);
  if (!ship) return warnings;
  const hull: SdeType = ship;
  function checkSkills(type: SdeType, itemId?: string): void {
    for (const [idAttr, levelAttr] of requiredSkills) {
      const id = attribute(type, idAttr);
      const level = attribute(type, levelAttr) ?? 0;
      if (id && skillLevel(profile, id) < level) warnings.push({
        code: 'skill', itemId, message: msg('requiredSkillLevel', nameText(entries.get(type.id)?.names, type.name ?? type.id),
          nameText(entries.get(id)?.names, id), level),
      });
    }
  }
  checkSkills(hull);
  function inspect(item: FitItem) {
    const type = item.typeId === undefined ? undefined : dataset.getType(item.typeId);
    if (!type) return;
    const name = nameText(entries.get(type.id)?.names, type.name ?? type.id);
    const warn = (code: string, message: Text) => warnings.push({ code, itemId: item.id, message: msg('itemWarning', name, message) });
    if (item.group === 'cargo') return;
    checkSkills(type, item.id);
    const expectedSlot = entries.get(type.id)?.slot;
    if (expectedSlot && expectedSlot !== item.group) warn('slot-mismatch', msg('requiresSlot', expectedSlot));
    if (expectedSlot && item.quantity !== 1) warn('slot-quantity', msg('aSlotHoldsOneModule'));
    if (item.state === 'overheated' && !isOverloadableModule(type, dataset.effects)) {
      warn('overheat', msg('cannotOverheat'));
    }
    for (const warning of hullCompatibilityWarnings(hull, type, item.group === 'rig', dataset.attributes, name)) {
      warnings.push({ ...warning, itemId: item.id });
    }
    const charge = item.charge?.typeId ? dataset.getType(item.charge.typeId) : undefined;
    if (charge && acceptsModuleCharge(type, charge)) checkSkills(charge, item.id);
  }
  for (const item of fit.items) inspect(item);
  const tubeCount = shipValues.get(2216)?.final ?? 0;
  const fighterSquadrons = fit.items.filter(item => item.group === 'fighter');
  if (fighterSquadrons.length > tubeCount) warnings.push({ code: 'fighter-tubes', message: msg('fighterTubesExceeded', fighterSquadrons.length, tubeCount) });
  for (const fighter of fighterSquadrons) {
    const type = fighter.typeId && dataset.getType(fighter.typeId);
    const size = type && attribute(type, 2215);
    if (size && fighter.quantity > size) warnings.push({ code: 'fighter-squadron', itemId: fighter.id, message: msg('maxFighterSquadronSize', size) });
  }
  const droneLimit = activeDroneLimit(profile, shipValues);
  if (activeDrones > droneLimit) warnings.push({ code: 'drone-count', message: msg('tooManyActiveDrones', activeDrones, droneLimit) });
  return warnings;
}
