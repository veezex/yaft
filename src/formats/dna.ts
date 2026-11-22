import { LocalizedError, msg } from '../i18n/index.ts';
import type { Fit } from '../domain/fit.ts';
import { isTypeId } from '../domain/fit.ts';
import type { TransferInput, TransferLookup, TransferOutput } from './transfer.ts';
import { exportLosses } from './transfer.ts';

export function parseDna(text: string): TransferInput[] {
  const value = text.trim().replace(/^fitting:(?:\/\/)?/i, '');
  if (!value.endsWith('::')) throw new LocalizedError(msg('dnaLinkMustEndWith'));
  const [ship, ...rows] = value.slice(0, -2).split(':');
  const hull = Number(ship);
  if (!/^\d+$/.test(ship) || !isTypeId(hull)) throw new LocalizedError(msg('invalidHullIdInDna'));
  return [{ hull, rows: rows.map(line => {
    const match = /^(\d+);(\d+)$/.exec(line);
    const [type, quantity] = [Number(match?.[1]), Number(match?.[2])];
    if (!isTypeId(type) || !isTypeId(quantity)) throw new LocalizedError(msg('invalidDnaEntry', line));
    return { type, quantity, line };
  }) }];
}

export function exportDna(fit: Fit, catalog: TransferLookup): TransferOutput {
  const quantities = new Map<number, number>();
  for (const item of fit.items) {
    if (item.typeId && catalog.byId.has(item.typeId)) quantities.set(item.typeId, (quantities.get(item.typeId) ?? 0) + item.quantity);
    const charge = item.charge?.typeId;
    if (charge && catalog.byId.has(charge)) quantities.set(charge, (quantities.get(charge) ?? 0) + 1);
  }
  const text = [fit.shipTypeId, ...Array.from(quantities, ([type, quantity]) => `${type};${quantity}`)].join(':') + '::';
  return { text, losses: exportLosses(fit, 'dna', catalog) };
}
