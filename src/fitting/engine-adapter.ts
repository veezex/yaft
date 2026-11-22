import { LocalizedError, msg, nameText } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { ATTR, computeFit, moduleAcceptsAnyCharge } from 'eve-fit-engine';
import type {
  Fit as EngineFit, ComputeFitOptions, FittingDataset, ModuleState, SdeType, SlotType, TypeBucket,
} from 'eve-fit-engine';
import { validateConditions } from '../domain/conditions.ts';
import type { Fit, SlotGroup } from '../domain/fit.ts';
import { acceptsModuleCharge, activeDroneLimit, attribute, equipmentWarnings, hullCompatibilityWarnings, resourceWarnings } from '../domain/fit-validation.ts';
import { fitItemIssues, isSlotGroup } from '../domain/fit.ts';
import type { SkillProfile } from '../domain/skills.ts';
import { skillLevel } from '../domain/skills.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';
import type { CatalogIndex, CatalogLabels, DogmaDataset, TypeSegment } from './dataset.ts';
import { appliedDps, calculationGraphs, engineTarget } from './graphs.ts';
import { fitMetrics } from './metrics.ts';
import type { CalculateRequest, CalculationResult, CatalogAttribute, SearchRequest } from './worker-protocol.ts';

const engineSlots: Record<SlotGroup, SlotType> = {
  high: 'HI', mid: 'MED', low: 'LO', rig: 'RIG', subsystem: 'SUBSYSTEM', service: 'SERVICE',
};
const states: Record<string, ModuleState> = {
  offline: 'OFFLINE', online: 'ONLINE', active: 'ACTIVE', overheated: 'OVERLOAD',
};
const typeBuckets: Record<TypeBucket, number> = {
  ships: 6, modules: 7, charges: 8, drones: 18, fighters: 87, implants: 20, subsystems: 32,
  skills: 16, systemEffects: 2, structures: 65, structureModules: 66, mutaplasmids: 91,
};
const map = <T extends { id: number }>(items: T[]) => new Map(items.map(item => [item.id, item]));
const tacticalDestroyerGroup = 1305;
const shipModifiersGroup = 1306;
const anhingaTypeId = 89807;

export class EngineCatalog {
  readonly index: CatalogIndex;
  readonly entries: ReadonlyMap<number, CatalogType>;
  readonly data: FittingDataset;
  private readonly types = new Map<number, SdeType>();
  private readonly loads = new Map<string, Promise<Map<number, SdeType>>>();
  private readonly skillIds: number[];
  private readonly modeTypes: CatalogType[];
  private readonly chargeTypes = new Map<number, ReadonlySet<number>>();
  private readonly searchRows: { type: CatalogType; text: string }[];
  private readonly labels?: CatalogLabels;
  private readonly readSegment: (segment: string) => Promise<TypeSegment>;

  constructor(index: CatalogIndex, dogma: DogmaDataset, readSegment: (segment: string) => Promise<TypeSegment>) {
    this.index = index;
    this.readSegment = readSegment;
    this.labels = dogma.localizedLabels;
    this.entries = new Map(index.types.map(row => [row.typeId, row]));
    this.skillIds = index.types.filter(row => row.categoryId === 16).map(row => row.typeId);
    this.modeTypes = index.types.filter(row => row.groupId === shipModifiersGroup).sort((a, b) => a.typeId - b.typeId);
    this.searchRows = index.types.map(type => ({
      type,
      text: [...Object.values(type.names), type.group, type.category, String(type.typeId),
        this.labels?.groups[type.groupId]?.ru, this.labels?.categories[type.categoryId]?.ru].join(' ').toLowerCase(),
    }));
    this.data = {
      version: dogma.releaseId, attributes: map(dogma.attributes), units: map(dogma.units), effects: map(dogma.effects),
      metaGroups: map(dogma.metaGroups), categories: map(dogma.categories), groups: map(dogma.groups),
      marketGroups: map(dogma.marketGroups), cloneGrades: map(dogma.cloneGrades), dbuffCollections: map(dogma.dbuffCollections),
      dynamicAttributes: map(dogma.dynamicAttributes), typesByBucket: {},
      getType: id => this.types.get(id),
      loadBucket: async bucket => {
        const category = typeBuckets[bucket];
        const segment = index.types.find(type => type.categoryId === category)?.segment;
        const loaded = segment ? await this.load(segment) : new Map<number, SdeType>();
        this.data.typesByBucket[bucket] = loaded;
        return loaded;
      },
    };
  }

  private load(segment: string): Promise<Map<number, SdeType>> {
    let loading = this.loads.get(segment);
    if (!loading) {
      loading = this.readSegment(segment).then(data => {
        if (data.releaseId !== this.index.releaseId) throw new LocalizedError(msg('mixedCatalogReleases'));
        for (const item of data.types) this.types.set(item.id, item);
        return map(data.types);
      }).catch(error => {
        this.loads.delete(segment);
        throw error;
      });
      this.loads.set(segment, loading);
    }
    return loading;
  }

  async loadTypes(ids: Iterable<number | undefined>) {
    const segments = new Set<string>();
    for (const id of ids) {
      const type = id === undefined ? undefined : this.entries.get(id);
      if (type) segments.add(type.segment);
    }
    await Promise.all([...segments].map(segment => this.load(segment)));
  }

  hullModes(typeId: number): CalculationResult['hullModes'] {
    const hull = this.entries.get(typeId);
    const name = hull?.names.en?.toLowerCase();
    if (!name || (hull?.groupId !== tacticalDestroyerGroup && typeId !== anhingaTypeId)) return [];
    return this.modeTypes.flatMap(mode => {
      const label = mode.names.en;
      return label?.toLowerCase().startsWith(name + ' ') ? [{ typeId: mode.typeId, name: label, names: mode.names }] : [];
    });
  }

  async equipmentWarning(hullTypeId: number, typeId: number): Promise<Text | undefined> {
    await this.loadTypes([hullTypeId, typeId]);
    const hull = this.data.getType(hullTypeId);
    const item = this.data.getType(typeId);
    if (!hull) throw new LocalizedError(msg('unknownHull', hullTypeId));
    if (!item) throw new LocalizedError(msg('unknownCatalogType', typeId));
    const rig = this.entries.get(typeId)?.slot === 'rig';
    return hullCompatibilityWarnings(hull, item, rig, this.data.attributes, nameText(this.entries.get(typeId)?.names, item.name ?? typeId))[0]?.message;
  }

  private async compatibleChargeIds(typeId: number): Promise<ReadonlySet<number>> {
    const cached = this.chargeTypes.get(typeId);
    if (cached) return cached;
    await this.loadTypes([typeId]);
    const module = this.data.getType(typeId);
    const matching = new Set<number>();
    if (module && moduleAcceptsAnyCharge(module)) {
      const charges = await this.data.loadBucket('charges');
      for (const charge of charges.values()) {
        if (acceptsModuleCharge(module, charge)) matching.add(charge.id);
      }
    }
    this.chargeTypes.set(typeId, matching);
    return matching;
  }

  async search({ query, offset, limit, categoryIds, typeIds, exactNames, groupIds, includeUnpublished, moduleTypeId }: SearchRequest) {
    const compatibleCharges = moduleTypeId === undefined ? undefined : await this.compatibleChargeIds(moduleTypeId);
    const needle = query.trim().toLowerCase();
    const terms = needle.split(/\s+/).filter(Boolean);
    const requested = typeIds && new Set(typeIds);
    const names = exactNames && new Set(exactNames.map(name => name.trim().toLowerCase()));
    const results = this.searchRows.filter(({ type, text }) =>
      (!compatibleCharges || compatibleCharges.has(type.typeId)) &&
      (includeUnpublished || type.published) && (!categoryIds?.length || categoryIds.includes(type.categoryId)) &&
      (!requested && !names || requested?.has(type.typeId) || names && Object.values(type.names).some(name => names.has(name.toLowerCase()))) && (!groupIds?.length || groupIds.includes(type.groupId)) &&
      terms.every(term => text.includes(term))).map(row => row.type);
    let ordered = results;
    if (needle) {
      const rank = (type: CatalogType) => {
        const names = Object.values(type.names).map(name => name.toLowerCase());
        if (String(type.typeId) === needle || names.includes(needle)) return 0;
        if (names.some(name => name.startsWith(needle))) return 1;
        if (names.some(name => name.includes(needle))) return 2;
        return 3;
      };
      const groups: CatalogType[][] = [[], [], [], []];
      for (const type of results) groups[rank(type)].push(type);
      ordered = groups.flat();
    }
    const page = ordered.slice(offset, offset + limit).map(type => ({
      ...type, groupNames: this.labels?.groups[type.groupId], categoryNames: this.labels?.categories[type.categoryId],
    }));
    return { results: page, nextOffset: offset + limit < results.length ? offset + limit : null };
  }

  async describe(types: CatalogType[]): Promise<Record<number, CatalogAttribute[]>> {
    await this.loadTypes(types.map(type => type.typeId));
    return Object.fromEntries(types.map(type => [type.typeId, (this.data.getType(type.typeId)?.attributes ?? []).flatMap(attribute => {
      const meta = this.data.attributes.get(attribute.id);
      if (!meta?.displayName) return [];
      return [{
        name: meta.displayName, names: this.labels?.attributes[attribute.id], value: attribute.v,
        unit: meta.unitID === undefined ? undefined : this.data.units.get(meta.unitID)?.displayName,
        unitNames: meta.unitID === undefined ? undefined : this.labels?.units[meta.unitID],
      }];
    })]));
  }

  profile(profile: SkillProfile): ComputeFitOptions['skillProfile'] {
    return { name: profile.name, isDefault: false, source: 'manual',
      skills: Object.fromEntries(this.skillIds.map(id => [id, skillLevel(profile, id)])) };
  }
}

function toEngineFit(fit: Fit, catalog: EngineCatalog, request: CalculateRequest, result: CalculationResult): EngineFit {
  const { conditions } = request;
  const { warnings, hullModes, chargeableTypeIds } = result;
  const engine: EngineFit = {
    id: fit.id, shipTypeID: fit.shipTypeId, name: fit.name, description: fit.description, visibility: 'PRIVATE', tags: [],
    modules: [], drones: [], fighters: [], cargo: [], implants: [], boosters: [], subsystems: [],
    modeTypeID: hullModes[0]?.typeId,
  };
  const known = (typeId: number | undefined, original?: string, itemId?: string) => {
    if (typeId !== undefined && catalog.data.getType(typeId)) return typeId;
    warnings.push({ code: 'unknown-type', message: msg('unknownCatalogType', original ?? typeId ?? '?'), itemId });
    return undefined;
  };
  if (fit.modeTypeId !== undefined) {
    if (hullModes.some(mode => mode.typeId === fit.modeTypeId)) engine.modeTypeID = fit.modeTypeId;
    else warnings.push({ code: 'incompatible-mode', message: msg('incompatibleHullMode') });
  }
  for (const item of fit.items) {
    const typeID = known(item.typeId, item.unknownSource, item.id);
    if (typeID === undefined) continue;
    const { id, quantity } = item;
    switch (item.group) {
      case 'cargo': engine.cargo.push({ id, typeID, count: quantity }); break;
      case 'drone':
        engine.drones.push({ id, typeID, countTotal: quantity, countActive: item.activeQuantity ?? 0 });
        break;
      case 'fighter': engine.fighters.push({ id, typeID, count: quantity, abilityState: item.fighterAbilities ?? {} }); break;
      case 'subsystem': engine.subsystems.push({ id, typeID, slot: item.position ?? 0 }); break;
      default: {
        const module = catalog.data.getType(typeID)!;
        if (moduleAcceptsAnyCharge(module)) chargeableTypeIds.push(typeID);
        let chargeTypeID = item.charge ? known(item.charge.typeId, item.charge.unknownSource, id) : undefined;
        if (chargeTypeID !== undefined) {
          const charge = catalog.data.getType(chargeTypeID)!;
          if (!acceptsModuleCharge(module, charge)) {
            warnings.push({ code: 'charge', itemId: id, message: msg('incompatibleCharge', nameText(catalog.entries.get(chargeTypeID)?.names, charge.name ?? chargeTypeID),
              nameText(catalog.entries.get(typeID)?.names, module.name ?? typeID)) });
            chargeTypeID = undefined;
          }
        }
        engine.modules.push({ id, typeID, position: item.position ?? 0, slotType: engineSlots[item.group],
          state: states[item.state ?? 'online'],
          chargeTypeID,
          mutator: item.abyssal && { dynamicTypeID: item.abyssal.mutaplasmidTypeId, sourceTypeID: item.abyssal.sourceTypeId,
            attributes: item.abyssal.attributes },
        });
      }
    }
  }
  for (const implant of conditions?.implants ?? []) {
    const typeID = known(implant.typeId);
    if (typeID !== undefined) engine.implants.push({ id: `implant-${implant.slot}`, typeID, slot: implant.slot });
  }
  for (const booster of conditions?.boosters ?? []) {
    const typeID = known(booster.typeId);
    if (typeID !== undefined) engine.boosters.push({ id: `booster-${booster.slot}`, typeID, slot: booster.slot, activeSideEffects: booster.sideEffects });
  }
  return engine;
}

export async function calculateFit(catalog: EngineCatalog, request: CalculateRequest): Promise<CalculationResult> {
  const { fit, profile, requestId, fitRevision, compatibilityId } = request;
  const warnings = fitItemIssues(fit.items).map(message => ({ code: 'invalid-item', message })) as CalculationResult['warnings'];
  const conditions = request.conditions && validateConditions(request.conditions, new Map(request.snapshots?.map(item => [item.id, item])));
  const hullModes = catalog.hullModes(fit.shipTypeId);
  const ids = [fit.shipTypeId, hullModes[0]?.typeId, fit.modeTypeId, conditions?.environmentTypeId,
    ...fit.items.flatMap(item => [item.typeId, item.charge?.typeId, item.abyssal?.sourceTypeId, item.abyssal?.mutaplasmidTypeId]),
    ...(conditions?.implants ?? []).map(item => item.typeId), ...(conditions?.boosters ?? []).map(item => item.typeId),
  ];
  await Promise.all([catalog.data.loadBucket('skills'), catalog.loadTypes(ids)]);
  const result: CalculationResult = {
    requestId, compatibilityId, fitRevision, hullModes, chargeableTypeIds: [], activeDrones: {},
    warnings, metrics: [], graphs: [],
  };
  if (!catalog.data.getType(fit.shipTypeId)) {
    warnings.push({ code: 'unknown-hull', message: msg('unknownHull', fit.shipTypeId) });
    return result;
  }
  const engine = toEngineFit(fit, catalog, { ...request, conditions }, result);
  const { target, damage, environmentTypeId } = conditions ?? {};
  if (conditions?.sources.length) {
    warnings.push({ code: 'unsupported-projection', message: msg('unsupportedProjections') });
  }
  if (environmentTypeId && !catalog.data.getType(environmentTypeId)) {
    warnings.push({ code: 'unknown-type', message: msg('unknownEnvironment', environmentTypeId) });
  }
  const options = {
    skillProfile: catalog.profile(profile), systemEffectTypeID: environmentTypeId,
    damageProfile: damage && { name: 'Incoming damage', ...damage },
    targetProfile: target && engineTarget(target),
  };
  let computed = computeFit(engine, catalog.data, options);
  const autoDroneIds = new Set(fit.items.filter(item => item.group === 'drone' && item.activeQuantity === undefined).map(item => item.id));
  if (autoDroneIds.size) {
    const { droneBandwidthMax, droneBandwidthUsed } = computed.derived.fitting;
    let slots = activeDroneLimit(profile, computed.ship) - computed.derived.drones.active;
    let bandwidth = droneBandwidthMax - droneBandwidthUsed;
    let launched = false;
    for (const drone of engine.drones) {
      if (slots <= 0 || bandwidth <= 0) break;
      if (!autoDroneIds.has(drone.id)) continue;
      const cost = attribute(catalog.data.getType(drone.typeID)!, ATTR.DRONE_BANDWIDTH_USED);
      if (!cost || cost < 0) continue;
      const count = Math.max(0, Math.min(drone.countTotal, slots, Math.floor(bandwidth / cost)));
      drone.countActive = count;
      slots -= count;
      bandwidth -= count * cost;
      launched ||= count > 0;
    }
    if (launched) computed = computeFit(engine, catalog.data, options);
  }
  result.activeDrones = Object.fromEntries(engine.drones.map(drone => [drone.id, drone.countActive]));
  const partial = warnings.length > 0;
  result.metrics = fitMetrics(computed, partial, catalog.data);
  if (target) result.metrics.push({ key: 'appliedDps', label: msg('appliedDamage'), unit: 'DPS', status: partial ? 'partial' : 'computed',
    value: appliedDps(computed.derived.offense.breakdown, target, target.distanceMeters) });
  result.graphs = calculationGraphs(computed.derived.offense.breakdown, target, partial);
  warnings.push(...resourceWarnings(computed.derived.fitting),
    ...equipmentWarnings(fit, catalog.data, catalog.entries, profile, computed.ship, computed.derived.drones.active));
  for (const row of fit.items) {
    if (row.position === undefined || !isSlotGroup(row.group)) continue;
    const max = computed.derived.fitting.slots[engineSlots[row.group]].max;
    if (row.position >= max) warnings.push({ code: 'slot-position', itemId: row.id,
      message: msg('outsideHullSlots', row.group, row.position + 1, max) });
  }
  return result;
}
