import type { SdeType } from 'eve-fit-engine';
import type { DogmaDataset, CatalogIndex, CatalogLabels, TypeSegment } from '../../src/fitting/dataset.ts';
import type { CatalogType } from '../../src/storage/catalog-contract.ts';
import type { SdeRelease } from './snapshot.ts';

type Row = Record<string, unknown>;
type DogmaRow = {
  typeID: number;
  dogmaAttributes: { attributeID: number; value: number }[];
  dogmaEffects: { effectID: number; isDefault?: boolean }[];
};

const English = (value: unknown) => typeof value === 'string' ? value : (value as Record<string, string> | undefined)?.en;
const byKey = (rows: Row[], key: string) => new Map(rows.map(row => [row[key], row]));
const slots = new Map<number, CatalogType['slot']>([
  [11, 'low'], [12, 'high'], [13, 'mid'], [2663, 'rig'], [3772, 'subsystem'], [6306, 'service'],
]);

function namespacedRows<T>(rows: Row[], key: string): T[] {
  return rows.map(row => ({
    ...row, id: row[key], name: English(row.name), displayName: English(row.displayName),
  })) as T[];
}

function russianLabels(rows: Row[], key: string, field: 'name' | 'displayName'): CatalogLabels['groups'] {
  return Object.fromEntries(rows.flatMap(row => {
    const labels = row[field] as Record<string, string> | undefined;
    return labels?.ru?.trim() && labels.ru !== labels.en ? [[Number(row[key]), { ru: labels.ru }]] : [];
  }));
}

export function normalize(snapshot: SdeRelease) {
  const releaseId = snapshot.releaseId;
  const table = snapshot.tables;
  const groups = byKey(table.groups.rows, 'groupID');
  const categories = byKey(table.categories.rows, 'categoryID');
  const typeDogma = new Map((table.typeDogma.rows as unknown as DogmaRow[]).map(row => [row.typeID, row]));
  const index: CatalogIndex = { releaseId, types: [] };
  const segments = new Map<string, TypeSegment>();
  for (const row of table.types.rows) {
    const typeId = Number(row.typeID);
    const groupId = Number(row.groupID);
    const group = groups.get(groupId)!;
    const categoryId = Number(group.categoryID);
    const category = categories.get(categoryId)!;
    const segment = `category-${categoryId}`;
    const raw = typeDogma.get(typeId);
    const effects: SdeType['effects'] = raw?.dogmaEffects.map(effect => ({ id: effect.effectID, def: effect.isDefault ? 1 : 0 })) ?? [];
    const slot = effects.map(effect => slots.get(effect.id)).find(Boolean) ??
      (categoryId === 32 ? 'subsystem' : undefined);
    index.types.push({
      typeId, names: row.name as CatalogType['names'], groupId, categoryId, segment,
      group: English(group.name) ?? String(groupId), category: English(category.name) ?? String(categoryId),
      published: row.published === true, marketGroupId: row.marketGroupID as number | undefined,
      metaGroupId: row.metaGroupID as number | undefined, volume: row.volume as number | undefined, slot,
    });
    const normalized: SdeType = {
      id: typeId, name: English(row.name), groupID: groupId, categoryID: categoryId,
      marketGroupID: row.marketGroupID as number | undefined, metaGroupID: row.metaGroupID as number | undefined,
      metaLevel: row.metaLevel as number | undefined, iconID: row.iconID as number | undefined,
      variationParentTypeID: row.variationParentTypeID as number | undefined,
      mass: row.mass as number | undefined, volume: row.volume as number | undefined,
      capacity: row.capacity as number | undefined, portionSize: row.portionSize as number | undefined,
      basePrice: row.basePrice as number | undefined,
      attributes: raw?.dogmaAttributes.map(attribute => ({ id: attribute.attributeID, v: attribute.value })) ?? [],
      effects,
    };
    let part = segments.get(segment);
    if (!part) {
      part = { releaseId, types: [] };
      segments.set(segment, part);
    }
    part.types.push(normalized);
  }
  index.types.sort((a, b) => (a.names.en ?? '').localeCompare(b.names.en ?? '', 'en') || a.typeId - b.typeId);
  const dogma: DogmaDataset = {
    releaseId,
    localizedLabels: {
      groups: russianLabels(table.groups.rows, 'groupID', 'name'),
      categories: russianLabels(table.categories.rows, 'categoryID', 'name'),
      attributes: russianLabels(table.dogmaAttributes.rows, 'attributeID', 'displayName'),
      units: russianLabels(table.dogmaUnits.rows, 'unitID', 'displayName'),
    },
    attributes: namespacedRows(table.dogmaAttributes.rows, 'attributeID'),
    units: namespacedRows(table.dogmaUnits.rows, 'unitID'),
    effects: namespacedRows(table.dogmaEffects.rows.map(row => ({ ...row, modifierInfo: row.modifierInfo ?? [] })), 'effectID'),
    categories: namespacedRows(table.categories.rows, 'categoryID'),
    groups: namespacedRows(table.groups.rows, 'groupID'),
    marketGroups: namespacedRows(table.marketGroups.rows, 'marketGroupID'),
    metaGroups: namespacedRows(table.metaGroups.rows, 'metaGroupID'),
    cloneGrades: namespacedRows(table.cloneGrades.rows, 'cloneGradeID'),
    dbuffCollections: namespacedRows(table.dbuffCollections.rows, 'dbuffCollectionID'),
    dynamicAttributes: namespacedRows(table.dynamicItemAttributes.rows.map(row => ({
      ...row, attributeIDs: (row.attributeIDs as Row[]).map(attribute => ({
        id: attribute.attributeID, min: attribute.min, max: attribute.max,
      })),
    })), 'typeID'),
    bonuses: table.typeBonus.rows,
    fighterAbilities: table.fighterAbilities.rows,
    fighterAbilitiesByType: table.fighterAbilitiesByType.rows,
    systemWideEffects: table.systemWideEffects.rows,
    systemDbuffEmitters: table.systemDbuffEmitters.rows,
  };
  return { index, dogma, segments };
}
