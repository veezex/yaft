import { LocalizedError, msg } from '../i18n/index.ts';
import { formatEft } from 'eve-fit-engine';
import type { Fit as EngineFit, FittingDataset, SdeType, SlotType } from 'eve-fit-engine';
import type { Fit } from '../domain/fit.ts';
import type { TransferInput, TransferLookup, TransferOutput } from './transfer.ts';
import { exportLosses } from './transfer.ts';

export function parseEft(text: string): TransferInput[] {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const header = /^\[([^,\]]+),\s*(.+)\]$/.exec(lines[0]);
  if (!header) throw new LocalizedError(msg('enterAnEftHeaderSuch'));
  const [, hull, name] = header;
  const rows = lines.slice(1).flatMap(line => {
    const value = line.trim();
    if (!value) return [];
    if (/^\[empty (low|med|mid|hi|high|rig|subsystem|service) slot\]$/i.test(value)) return [];
    const parts = value.split(/,\s*/);
    const match = /^(.+?)\s+[x×](-?\d+)$/i.exec(parts[0]);
    return [{ type: match?.[1] ?? parts[0], quantity: parts.length > 2 ? 0 : match ? Number(match[2]) : 1,
      charge: parts[1], line: value }];
  });
  return [{ hull: hull.trim(), name, rows }];
}

const slots: Record<string, SlotType> = { high: 'HI', mid: 'MED', low: 'LO', rig: 'RIG', service: 'SERVICE' };
export function exportEft(fit: Fit, catalog: TransferLookup): TransferOutput {
  const engine: EngineFit = { shipTypeID: fit.shipTypeId, name: fit.name.replace(/[\r\n]+/g, ' '), visibility: 'PRIVATE', tags: [],
    modules: [], subsystems: [], drones: [], fighters: [], implants: [], boosters: [], cargo: [] };
  for (const item of fit.items) {
    if (!item.typeId || !catalog.byId.has(item.typeId)) continue;
    const typeID = item.typeId;
    const id = item.id;
    const position = item.position ?? 0;
    if (item.group === 'subsystem') engine.subsystems.push({ id, typeID, slot: position });
    else if (item.group === 'drone') engine.drones.push({ id, typeID, countTotal: item.quantity, countActive: 0 });
    else if (slots[item.group]) engine.modules.push({ id, typeID, position, slotType: slots[item.group],
      state: 'ONLINE', chargeTypeID: item.charge?.typeId });
    else engine.cargo.push({ id, typeID, count: item.quantity });
  }
  const dataset = { getType(id: number): SdeType | undefined {
    const item = catalog.byId.get(id);
    if (!item) return undefined;
    return { id, name: item.names.en, groupID: item.groupId, categoryID: item.categoryId, attributes: [], effects: [] };
  } };
  return { text: formatEft(engine, dataset as FittingDataset), losses: exportLosses(fit, 'eft', catalog) };
}
