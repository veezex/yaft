import { dictionaries, localizedName, msg, nameText } from '../i18n/index.ts';
import type { LabelKey, Locale, Text } from '../i18n/index.ts';
import { isSlotGroup, isTypeId, newFit } from '../domain/fit.ts';
import type { Fit, FitItem, ItemGroup } from '../domain/fit.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';

export interface TransferRow {
  type: string | number;
  charge?: string | number;
  line: string;
  quantity: number;
  group?: ItemGroup;
  position?: number;
}
export interface TransferInput {
  hull: string | number;
  name?: string;
  description?: string;
  rows: TransferRow[];
}
export interface TransferIssue {
  source: string;
  message: Text;
}
export interface TransferPreview {
  fits: Fit[];
  issues: TransferIssue[];
}
export interface TransferOutput {
  text: string;
  losses: LabelKey[];
}

export function buildLookup(types: CatalogType[]) {
  const byId = new Map<number, CatalogType>();
  const byName = new Map<string, CatalogType>();
  for (const type of types) {
    byId.set(type.typeId, type);
    for (const name of Object.values(type.names)) {
      const key = name.trim().toLowerCase();
      const previous = byName.get(key);
      if (!previous || (type.published && !previous.published) ||
          (type.published === previous.published && type.typeId > previous.typeId)) byName.set(key, type);
    }
  }
  return { byId, get: (type: string | number) => typeof type === 'number' ? byId.get(type) : byName.get(type.trim().toLowerCase()) };
}
export type TransferLookup = ReturnType<typeof buildLookup>;

export function resolveTransfer(
  inputs: TransferInput[], catalog: TransferLookup,
  canLoadCharge?: (moduleTypeId: number, chargeTypeId: number) => boolean,
  locale: Locale = 'en',
): TransferPreview {
  const preview: TransferPreview = { fits: [], issues: [] };
  for (const input of inputs) {
    const hull = catalog.get(input.hull);
    if (!hull || ![6, 65].includes(hull.categoryId)) {
      preview.issues.push({ source: String(input.hull), message: msg('hullIsNotInThis') });
      continue;
    }
    const fit = newFit(hull.typeId, input.name?.trim() || dictionaries[locale].defaultFitName(localizedName(locale, hull.names) ?? hull.typeId));
    fit.description = input.description ?? '';
    const positions = new Map<ItemGroup, Set<number>>();
    for (const row of input.rows) {
      const type = catalog.get(row.type);
      if (!type || !isTypeId(row.quantity)) {
        preview.issues.push({ source: row.line, message: type ? msg('quantityMustBeAPositive') : msg('unknownCatalogEntry') });
        continue;
      }
      const defaultGroup = type.slot ?? (type.categoryId === 18 ? 'drone' : type.categoryId === 87 ? 'fighter' : 'cargo');
      const group = row.group ?? defaultGroup;
      const slotted = isSlotGroup(group);
      const count = slotted ? row.quantity : 1;
      if (slotted && (count > 32 || (row.position !== undefined && row.position + count > 32))) {
        preview.issues.push({ source: row.line, message: msg('slotPositionOrCountIs') });
        continue;
      }
      let charge;
      if (row.charge !== undefined) {
        const resolved = catalog.get(row.charge);
        if (resolved?.categoryId !== 8) {
          preview.issues.push({ source: row.line, message: msg('unknownOrInvalidCharge', row.charge) });
        } else if (!slotted || (canLoadCharge && !canLoadCharge(type.typeId, resolved.typeId))) {
          preview.issues.push({ source: row.line, message: msg('chargeOmitted', nameText(type.names, type.typeId)) });
        } else charge = { typeId: resolved.typeId };
      }
      const occupied = positions.get(group) ?? new Set<number>();
      positions.set(group, occupied);
      for (let index = 0; index < count; index++) {
        let position: number | undefined;
        if (slotted) {
          position = (row.position ?? 0) + index;
          if (row.position !== undefined && occupied.has(position)) {
            preview.issues.push({ source: row.line, message: msg('duplicateSlotPosition') });
            break;
          }
          while (occupied.has(position)) position++;
          occupied.add(position);
        }
        const item: FitItem = { id: crypto.randomUUID(), typeId: type.typeId, group, position,
          quantity: slotted ? 1 : row.quantity, state: slotted ? 'online' : undefined, charge };
        fit.items.push(item);
      }
    }
    preview.fits.push(fit);
  }
  return preview;
}

export function exportLosses(fit: Fit, format: 'eft' | 'xml' | 'dna', catalog: TransferLookup): LabelKey[] {
  const losses = new Set<LabelKey>();
  if (fit.skillProfileId !== 'all-v') losses.add('skillProfile');
  if (fit.conditionsId) losses.add('simulationConditions');
  if (fit.modeTypeId) losses.add('hullMode');
  if (format !== 'xml' && fit.description) losses.add('fitDescription');
  if (format === 'dna') losses.add('fitNameAndExactSlot');
  for (const row of fit.items) {
    if (row.typeId === undefined || !catalog.byId.has(row.typeId)) losses.add('unknownEquipmentEntries');
    if (row.charge && (row.charge.typeId === undefined || !catalog.byId.has(row.charge.typeId))) losses.add('unknownLoadedCharges');
    if (row.charge && format !== 'eft') losses.add('loadedChargesBecomeCargo');
    if (row.state && row.state !== 'online') losses.add('moduleState');
    if (row.activeQuantity) losses.add('activeDroneCounts');
    if (row.fighterAbilities) losses.add('fighterAbilityStates');
    if (row.abyssal) losses.add('abyssalAttributeOverrides');
    if (format === 'eft' && row.group === 'fighter') losses.add('fightersBecomeInventoryEntriesIn');
    if (format === 'eft' && row.group === 'cargo' && row.typeId && catalog.byId.get(row.typeId)?.slot) {
      losses.add('eftReadersMayRefitGear');
    }
  }
  return [...losses];
}
