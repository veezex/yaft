import { LocalizedError, msg } from '../i18n/index.ts';
import { SaxesParser } from 'saxes';
import type { Fit, ItemGroup } from '../domain/fit.ts';
import type { TransferInput, TransferLookup, TransferOutput } from './transfer.ts';
import { exportLosses } from './transfer.ts';

const labels: Record<string, ItemGroup> = {
  hi: 'high', med: 'mid', low: 'low', rig: 'rig', subsystem: 'subsystem', service: 'service',
  cargo: 'cargo', 'drone bay': 'drone', 'fighter bay': 'fighter',
};

export function parseXml(text: string): TransferInput[] {
  const output: TransferInput[] = [];
  const stack: string[] = [];
  let current: TransferInput | undefined;
  const parser = new SaxesParser();
  parser.on('doctype', () => { throw new LocalizedError(msg('doctypeIsNotPermittedIn')); });
  parser.on('error', error => { throw new LocalizedError(msg('malformedFittingXml', error.message)); });
  parser.on('opentag', node => {
    stack.push(node.name);
    const path = stack.join('/');
    switch (path) {
      case 'fittings': break;
      case 'fittings/fitting':
        current = { hull: '', name: node.attributes.name, rows: [] };
        output.push(current);
        break;
      case 'fittings/fitting/shipType':
        current!.hull = node.attributes.value || '';
        break;
      case 'fittings/fitting/description':
        current!.description = node.attributes.value ?? '';
        break;
      case 'fittings/fitting/hardware': {
        const slot = node.attributes.slot?.trim().toLowerCase() ?? '';
        const match = /^(hi|med|low|rig|subsystem|service) slot (\d+)$/.exec(slot);
        const group = labels[match?.[1] ?? slot];
        const quantity = node.attributes.qty === undefined ? 1 : Number(node.attributes.qty);
        current!.rows.push({ type: node.attributes.type ?? '', position: match ? Number(match[2]) : undefined,
          line: `${node.attributes.type ?? '?'} · ${slot}`, quantity: group ? quantity : 0, group });
        break;
      }
      default: if (stack.length === 1) throw new LocalizedError(msg('expectedAnEveFittingsDocument'));
    }
    if (stack.length > 16 || output.length > 512 || (current && current.rows.length > 2048)) throw new LocalizedError(msg('fittingXmlIsTooLarge'));
  });
  parser.on('closetag', () => { stack.pop(); });
  parser.write(text).close();
  if (!output.length) throw new LocalizedError(msg('noFittingEntriesInXml'));
  return output;
}

const escapeXml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '&#10;').replaceAll('\r', '&#13;').replaceAll('\t', '&#9;');

const slotName: Record<ItemGroup, string> = {
  high: 'hi slot', mid: 'med slot', low: 'low slot', rig: 'rig slot', subsystem: 'subsystem slot', service: 'service slot',
  drone: 'drone bay', fighter: 'fighter bay', cargo: 'cargo',
};
export function exportXml(fit: Fit, catalog: TransferLookup): TransferOutput {
  const nameOf = (id: number | undefined) => id === undefined ? undefined : catalog.byId.get(id)?.names.en;
  const hull = nameOf(fit.shipTypeId);
  if (!hull) throw new LocalizedError(msg('hullNameIsUnavailableFor'));
  const hardware = (slot: string, name: string, quantity: number) => `    <hardware slot="${slot}" type="${escapeXml(name)}" qty="${quantity}"/>`;
  const rows = fit.items.flatMap(item => {
    const name = nameOf(item.typeId);
    if (!name) return [];
    const slot = `${slotName[item.group]}${item.position === undefined ? '' : ` ${item.position}`}`;
    const charge = nameOf(item.charge?.typeId);
    return [hardware(slot, name, item.quantity), ...(charge ? [hardware('cargo', charge, 1)] : [])];
  });
  const text = ['<?xml version="1.0" encoding="UTF-8"?>', '<fittings>', `  <fitting name="${escapeXml(fit.name)}">`,
    `    <description value="${escapeXml(fit.description)}"/>`, `    <shipType value="${escapeXml(hull)}"/>`,
    ...rows, '  </fitting>', '</fittings>', ''].join('\n');
  return { text, losses: exportLosses(fit, 'xml', catalog) };
}
