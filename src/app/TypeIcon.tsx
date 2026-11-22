import { useLocale } from '../i18n/LocaleProvider.tsx';
import type { LabelKey } from '../i18n/index.ts';
import { memo } from 'react';
import { typeMark } from './type-mark.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';

type IconKind = 'hull' | 'module' | 'charge' | 'drone' | 'fighter' | 'cargo';
type Props = { type?: CatalogType; typeId?: number; kind: IconKind; abyssal?: boolean };

// IDs come from the SDE metaGroups table, including the structure variants.
const badges: Record<number, readonly [string, LabelKey]> = {
  1: ['T1', 'techI'], 2: ['T2', 'techIi'], 3: ['SL', 'storyline'], 4: ['FAC', 'faction'],
  5: ['OFF', 'officer'], 6: ['DS', 'deadspace'], 14: ['T3', 'techIii'], 15: ['ABY', 'abyssal'],
  17: ['PRE', 'premium'], 19: ['LTD', 'limitedTime'], 52: ['FAC', 'structureFaction'],
  53: ['T2', 'structureTechIi'], 54: ['T1', 'structureTechI'], 62: ['ACA', 'academy'],
  63: ['ABR', 'aberrant'],
};

const moduleShapes = {
  high: 'M7 16l5-4h5V8h17v5H23v4l-5 4H7z',
  mid: 'M10 8h20l4 7-4 7H10l-4-7zM16 15h8',
  low: 'M9 9h22v6l-5 7H14l-5-7zM15 14h10',
  rig: 'M8 20l5-12h14l5 12zM15 17h10',
  subsystem: 'M14 7h12v5h6v9H8v-9h6z',
  service: 'M8 8h24v13H8zM15 12h10m-10 5h10',
  generic: 'M10 8h20l3 4v6l-3 4H10l-3-4v-6zM16 12h8m-8 6h8',
};
const moduleFamilies = {
  turret: 'M6 17l6-4h6v-3h17v4H23v3l-4 4H6z',
  launcher: 'M7 21V11l4-3h19l4 4v9H7zm7-9v5m5-5v5m5-5v5',
  repair: 'M10 8h20v14H10zm10 3v8m-4-4h8',
  shield: 'M20 6l11 4v4c0 4-5 7-11 9-6-2-11-5-11-9v-4z',
  propulsion: 'M10 9h20l-4 12H14zm5 3 5 5 5-5',
  capacitor: 'M8 11h24v10H8zm9 2-2 3h6l-2 3m6-10h4',
  scanner: 'M8 10h24a12 12 0 0 1-24 0zm12 10v2m-5 0h10',
  tackle: 'M10 8l10 14L30 8M8 13h24m-19 5h14m-7-10v14',
};
const groupFamilies: Record<number, keyof typeof moduleFamilies> = {
  53: 'turret', 54: 'turret', 55: 'turret', 56: 'launcher', 74: 'turret', 483: 'turret',
  506: 'launcher', 507: 'launcher', 508: 'launcher', 509: 'launcher', 510: 'launcher', 511: 'launcher',
  771: 'launcher', 1245: 'launcher', 62: 'repair', 325: 'repair', 1199: 'repair',
  38: 'shield', 40: 'shield', 41: 'shield', 1156: 'shield', 46: 'propulsion', 475: 'propulsion',
  68: 'capacitor', 76: 'capacitor', 650: 'scanner', 52: 'tackle', 65: 'tackle',
};
const aircraft = 'M20 6l5 8 10 6-12-1-3 3-3-3-12 1 10-6z';
const hullWings: Record<number, number> = {
  25: 10, 31: 10, 324: 10, 830: 10, 831: 10, 834: 10, 893: 10, 1283: 10, // frigate-sized
  26: 8, 358: 8, 832: 8, 833: 8, 894: 8, 906: 8, 963: 8, // cruiser-sized
  27: 5, 381: 5, 898: 5, 900: 5, 485: 4, 547: 4, 659: 4, 30: 3, // battleships and capitals
};

function iconShape(kind: IconKind, type?: CatalogType, id?: number) {
  if (!id) return 'M13 14l7-7 7 7-7 7z';
  if (kind === 'hull') {
    if (type?.categoryId === 65) return 'M20 6l13 5v8l-13 5-13-5v-8zM20 11v8m-5-4h10';
    const wings = hullWings[type?.groupId ?? 0] ?? 7;
    const nose = 4 + id % 5;
    const shoulder = 12 + id % 4;
    return `M20 ${nose}L24 ${nose + 6} ${40 - wings} ${shoulder}v5L25 ${shoulder + 2} 20 ${shoulder + 7} 15 ${shoulder + 2} ${wings} ${shoulder + 5}v-5L16 ${nose + 6}z`;
  }
  if (kind === 'drone' || kind === 'fighter') return aircraft;
  if (kind === 'charge') return 'M11 22v-8l3-6 3 6v8zM23 22v-8l3-6 3 6v8z';
  if (kind === 'cargo') return 'M9 10h22v12H9zM9 10l4-4h14l4 4m-14 4h6';
  const family = type && groupFamilies[type.groupId];
  return family ? moduleFamilies[family] : moduleShapes[type?.slot ?? 'generic'];
}

export function catalogIconKind(type: CatalogType): IconKind {
  switch (type.categoryId) {
    case 6: case 65: return 'hull';
    case 7: case 32: case 66: return 'module';
    case 8: return 'charge';
    case 18: return 'drone';
    case 87: return 'fighter';
    default: return 'cargo';
  }
}

export const TypeIcon = memo(function TypeIcon({ type, typeId, kind, abyssal }: Props) {
  const { m } = useLocale();
  const id = type?.typeId ?? typeId;
  const badge = badges[abyssal ? 15 : type?.metaGroupId ?? 0];
  return <svg className="type-icon" viewBox="0 0 40 36" width="40" height="36"
    role={badge ? 'img' : undefined} aria-label={badge ? m[badge[1]] : undefined} aria-hidden={badge ? undefined : true} focusable="false">
    <path className="type-silhouette" d={iconShape(kind, type, id)} />
    {id && Number.isSafeInteger(id) && id > 0 ? <path className="type-mark" d={typeMark(id)} /> : null}
    {badge && <g aria-hidden="true" className="type-badge">
      <rect x="19" y="24" width="20" height="11" rx="2" />
      <text x="29" y="32" textAnchor="middle">{badge[0]}</text>
    </g>}
  </svg>;
});
