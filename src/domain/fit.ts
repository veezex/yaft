import { LocalizedError, msg } from '../i18n/index.ts';
import { translate } from '../i18n/index.ts';
import type { Message } from '../i18n/index.ts';
export const slotGroups = ['high', 'mid', 'low', 'rig', 'subsystem', 'service'] as const;
export const itemGroups = [...slotGroups, 'drone', 'fighter', 'cargo'] as const;
export const moduleStates = ['offline', 'online', 'active', 'overheated'] as const;

export type SlotGroup = (typeof slotGroups)[number];
export type ItemGroup = (typeof itemGroups)[number];
export type ModuleState = (typeof moduleStates)[number];

export interface TypeReference {
  typeId?: number;
  unknownSource?: string;
}

export interface FitItem extends TypeReference {
  id: string;
  group: ItemGroup;
  position?: number;
  quantity: number;
  state?: ModuleState;
  charge?: TypeReference;
  activeQuantity?: number;
  fighterAbilities?: Record<number, boolean>;
  abyssal?: {
    mutaplasmidTypeId: number;
    sourceTypeId?: number;
    attributes: Record<number, number>;
  };
}

export interface Fit {
  id: string;
  revision: number;
  name: string;
  description: string;
  shipTypeId: number;
  modeTypeId?: number;
  items: FitItem[];
  skillProfileId: string;
  conditionsId?: string;
  status: 'draft' | 'saved';
  createdAt: string;
  updatedAt: string;
}

export function isTypeId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isSlotGroup(group: ItemGroup): group is SlotGroup {
  return slotGroups.some(slot => slot === group);
}

export function fitItemIssues(items: readonly FitItem[]): Message[] {
  const errors: Message[] = [];
  const positions = new Set<string>();
  const ids = new Set<string>();
  for (const item of items) {
    if (!item.id || ids.has(item.id)) errors.push(msg('fitItemIdsMustBe'));
    ids.add(item.id);
    if (!isTypeId(item.typeId) && !item.unknownSource?.trim()) errors.push(msg('missingTypeReference', item.id));
    if (!isTypeId(item.quantity)) errors.push(msg('invalidItemQuantity', item.id));
    if (!itemGroups.includes(item.group)) errors.push(msg('unknownSlotGroup', item.id));
    if (item.state !== undefined && !moduleStates.includes(item.state)) errors.push(msg('unknownState', item.id));
    if (item.charge && !isTypeId(item.charge.typeId) && !item.charge.unknownSource?.trim()) {
      errors.push(msg('missingChargeReference', item.id));
    }
    if (item.activeQuantity !== undefined &&
        (!Number.isSafeInteger(item.activeQuantity) || item.activeQuantity < 0 || item.activeQuantity > item.quantity)) {
      errors.push(msg('invalidActiveQuantity', item.id));
    }
    if (isSlotGroup(item.group)) {
      const position = `${item.group}:${item.position}`;
      if (item.position === undefined || !Number.isSafeInteger(item.position) || item.position < 0) {
        errors.push(msg('invalidSlotPosition', item.id));
      } else if (positions.has(position)) {
        errors.push(msg('slotOccupied', item.id, item.group, item.position));
      }
      positions.add(position);
    }
  }
  return errors;
}

export function validateFitItems(items: readonly FitItem[]): string[] {
  return fitItemIssues(items).map(issue => translate('en', issue));
}

export function newFit(shipTypeId: number, name: string): Fit {
  if (!isTypeId(shipTypeId)) throw new LocalizedError(msg('chooseAValidHull'));
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), revision: 0, name, description: '', shipTypeId, items: [],
    skillProfileId: 'all-v', status: 'draft', createdAt: now, updatedAt: now,
  };
}

export function copyFit(fit: Fit, name = fit.name): Fit {
  const copy = structuredClone(fit);
  const now = new Date().toISOString();
  return {
    ...copy, name, id: crypto.randomUUID(), revision: 0, createdAt: now, updatedAt: now,
    items: copy.items.map(item => ({ ...item, id: crypto.randomUUID() })),
  };
}
