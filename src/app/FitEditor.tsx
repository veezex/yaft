import { useLocale } from '../i18n/LocaleProvider.tsx';
import { localizedName } from '../i18n/index.ts';
import type { LabelKey } from '../i18n/index.ts';
import { memo, useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { Fit, FitItem, SlotGroup } from '../domain/fit.ts';
import { moduleStates, slotGroups } from '../domain/fit.ts';
import type { SkillProfile } from '../domain/skills.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';
import type { CalculationResult } from '../fitting/worker-protocol.ts';
import type { createFittingWorker } from '../fitting/worker-client.ts';
import { FitPrice } from './FitPrice.tsx';
import { SkillProfilePanel } from './SkillProfilePanel.tsx';
import { catalogIconKind, TypeIcon } from './TypeIcon.tsx';

export const itemGroupLabels = {
  high: 'highSlots', mid: 'midSlots', low: 'lowSlots', rig: 'rigs', subsystem: 'subsystems',
  service: 'serviceSlots', cargo: 'cargo', drone: 'drones', fighter: 'fighters',
} as const satisfies Record<FitItem['group'], LabelKey>;
const stateLabels = { offline: 'offline', online: 'online', active: 'activeLabel', overheated: 'overheated' } as const;
const slots: Record<SlotGroup, string> = {
  high: 'HI', mid: 'MED', low: 'LO', rig: 'RIG', subsystem: 'SUBSYSTEM', service: 'SERVICE',
};

interface Props {
  fit?: Fit;
  worker?: ReturnType<typeof createFittingWorker>;
  known: Record<number, CatalogType>;
  result?: CalculationResult;
  canSave: boolean;
  profiles: SkillProfile[];
  profile: SkillProfile;
  onEdit: Dispatch<SetStateAction<Fit | undefined>>;
  onProfile: (profile: SkillProfile) => Promise<void>;
  onSave: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onCharge: (id: string) => void;
  onReplace: (id: string) => void;
  saving: boolean;
}

export function FitEditor({
  fit, worker, known, result, canSave, profiles, profile, onEdit, onProfile, onSave, onCopy, onDownload,
  onCharge, onReplace, saving,
}: Props) {
  const { m, locale } = useLocale();
  const editItem = useCallback((id: string, patch: Partial<FitItem>) => {
    onEdit(current => current && { ...current, items: current.items.map(row => row.id === id ? { ...row, ...patch } : row) });
  }, [onEdit]);
  const removeItem = useCallback((id: string) => {
    onEdit(current => current && { ...current, items: current.items.filter(row => row.id !== id) });
  }, [onEdit]);
  const move = useCallback((row: FitItem, position: number) => {
    onEdit(current => current && { ...current, items: current.items.map(item => item.id === row.id ? { ...item, position } :
      item.group === row.group && item.position === position ? { ...item, position: row.position } : item) });
  }, [onEdit]);
  const selectProfile = useCallback((id: string) => {
    onEdit(current => current && { ...current, skillProfileId: id });
  }, [onEdit]);

  function renderRow(row: FitItem, capacity: number) {
    return <FittedItem key={row.id} row={row} capacity={capacity} type={known[row.typeId ?? 0]}
      chargeType={known[row.charge?.typeId ?? 0]} active={result?.activeDrones[row.id]}
      chargeable={row.typeId !== undefined && Boolean(result?.chargeableTypeIds.includes(row.typeId))}
      onEdit={editItem} onRemove={removeItem} onMove={move} onReplace={onReplace} onCharge={onCharge} />;
  }
  if (!fit) return <section className="panel editor">
    <header className="panel-heading"><h2>{m.fittingEditor}</h2></header>
    <div className="empty-state"><TypeIcon kind="hull" />
      <h3>{m.chooseAHull}</h3><p className="muted">{m.emptyEditor}</p></div>
  </section>;

  const hull = known[fit.shipTypeId];
  const hullModes = result?.hullModes ?? [];
  const unavailableMode = fit.modeTypeId !== undefined && result &&
    !hullModes.some(mode => mode.typeId === fit.modeTypeId);
  return <section className="panel editor">
    <header className="panel-heading"><h2>{m.fittingEditor}</h2><span className="fit-state">{fit.revision > 0 ? m.fitRevision(fit.revision) : m.unsaved}</span></header>
    <div className="editor-body">
      <div className="hull-heading"><TypeIcon type={hull} typeId={fit.shipTypeId} kind="hull" /><div><h3>{localizedName(locale, hull?.names) ?? m.hullWithId(fit.shipTypeId)}</h3><p>{localizedName(locale, hull?.groupNames) ?? hull?.group}</p></div></div>
      {hullModes.length > 0 && <label className="field">{m.hullMode}
        <select value={fit.modeTypeId ?? hullModes[0].typeId}
          onChange={event => {
            const modeTypeId = Number(event.target.value);
            if (hullModes.some(mode => mode.typeId === modeTypeId)) onEdit({ ...fit, modeTypeId });
          }}>
          {unavailableMode && <option value={fit.modeTypeId} disabled>{m.incompatibleMode}</option>}
          {hullModes.map(mode => <option key={mode.typeId} value={mode.typeId}>{localizedName(locale, mode.names) ?? mode.name}</option>)}
        </select>
      </label>}
      {unavailableMode && hullModes.length === 0 && <div className="actions">
        <span>{localizedName(locale, known[fit.modeTypeId!]?.names) ?? m.modeWithId(fit.modeTypeId)}</span>
        <button onClick={() => onEdit({ ...fit, modeTypeId: undefined })}>{m.clearMode}</button>
      </div>}
      <label className="field">{m.fitName}<input value={fit.name} onChange={event => onEdit({ ...fit, name: event.target.value })} /></label>
      <SkillProfilePanel worker={worker} profiles={profiles} profile={profile}
        onSelect={selectProfile} onSave={onProfile} />
      <FitPrice fit={fit} known={known} />
      <details className="description"><summary>{m.description}</summary>
        <textarea aria-label={m.fitDescription} value={fit.description} onChange={event => onEdit({ ...fit, description: event.target.value })} />
      </details>
      {slotGroups.map(group => {
        const items = fit.items.filter(item => item.group === group);
        const capacity = result?.metrics.find(metric => metric.key === `slot.${slots[group]}.max`)?.value;
        if (!items.length && (!capacity || group === 'service' && hull?.categoryId !== 65)) return null;
        return <div className="slot-group" key={group}>
          <h4>{m[itemGroupLabels[group]]}<span>{items.length}{typeof capacity === 'number' ? ` / ${capacity}` : ''}</span></h4>
          {!items.length && <p className="muted empty-slot">{m.addEquipmentFromTheCatalog}</p>}
          {items.map(row => renderRow(row, typeof capacity === 'number' ? capacity : 0))}
        </div>;
      })}
      {(['drone', 'fighter', 'cargo'] as const).map(group => {
        const items = fit.items.filter(item => item.group === group);
        if (!items.length) return null;
        return <div className="slot-group" key={group}>
          <h4>{m[itemGroupLabels[group]]}</h4>
          {items.map(row => renderRow(row, 0))}
        </div>;
      })}
      <div className="actions editor-actions">
        <button className="primary" disabled={saving || !canSave || !fit.name.trim()} onClick={onSave}>
          {result?.warnings.length ? m.saveDraft : m.saveFit}
        </button>
        <button disabled={saving || !fit.name.trim()} onClick={onCopy}>{m.duplicateFit}</button>
        <button onClick={onDownload}>{m.downloadOpenFit}</button>
      </div>
    </div>
  </section>;
}

const FittedItem = memo(function FittedItem({
  row, type, chargeType, capacity, active, chargeable, onEdit, onRemove, onMove, onReplace, onCharge,
}: {
  row: FitItem;
  type?: CatalogType;
  chargeType?: CatalogType;
  capacity: number;
  active?: number;
  chargeable: boolean;
  onEdit: (id: string, patch: Partial<FitItem>) => void;
  onRemove: (id: string) => void;
  onMove: (row: FitItem, position: number) => void;
  onReplace: (id: string) => void;
  onCharge: (id: string) => void;
}) {
  const { m, locale } = useLocale();
  const { group, id } = row;
  const label = localizedName(locale, type?.names) ?? row.unknownSource ?? (row.typeId ? m.unknownType(row.typeId) : m.unknownItem);
  const chargeName = localizedName(locale, chargeType?.names) ?? row.charge?.unknownSource;
  const slotted = group !== 'drone' && group !== 'fighter' && group !== 'cargo';
  return <div className="fitted-item">
    <div className="item-title">
      <div className="item-identity">
        <TypeIcon type={type} typeId={row.typeId} abyssal={Boolean(row.abyssal)}
          kind={type ? catalogIconKind(type) : slotted ? 'module' : group} />
        <strong title={label}>{label}</strong>
      </div>
      <div className="actions item-actions">
        <button className="subtle" onClick={() => onReplace(id)} aria-label={m.replaceItem(label)}>{m.replace}</button>
        <button className="subtle danger" onClick={() => onRemove(id)} aria-label={m.removeItem(label)}>{m.remove}</button>
      </div>
    </div>
    <div className="item-controls">
      {slotted ? <>
        <label>{m.position}<select value={row.position ?? 0} onChange={event => onMove(row, Number(event.target.value))}>
          {Array.from({ length: Math.max(capacity, (row.position ?? 0) + 1) }, (_, position) =>
            <option value={position} key={position}>{position + 1}</option>)}
        </select></label>
        {group !== 'subsystem' && group !== 'rig' && <label>{m.state}
          <select aria-label={m.stateOf(label)} value={row.state ?? 'online'}
            onChange={event => onEdit(id, { state: event.target.value as FitItem['state'] })}>
            {moduleStates.map(state => <option key={state} value={state}>{m[stateLabels[state]]}</option>)}
          </select></label>}
        {(chargeable || row.charge) && <div className="charge-controls">
          <button className="charge-button" data-hidden={!chargeable} disabled={!chargeable}
            aria-label={row.charge ? chargeName ?? m.chargeWithId(row.charge.typeId) : m.chooseCharge}
            onClick={() => onCharge(id)}>
            <TypeIcon type={chargeType} typeId={row.charge?.typeId} kind="charge" />
            <span>{row.charge ? chargeName ?? m.chargeWithId(row.charge.typeId) : m.chooseCharge}</span>
          </button>
          <button className="subtle" data-hidden={!row.charge} disabled={!row.charge}
            aria-label={m.unloadCharge(chargeName ?? m.charge)} onClick={() => onEdit(id, { charge: undefined })}>{m.unload}</button>
        </div>}
      </> : <>
        <label>{m.quantity}<input type="number" min={1} value={row.quantity}
          onChange={event => {
            const quantity = event.target.valueAsNumber;
            if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity !== row.quantity) onEdit(id, {
              quantity, activeQuantity: row.activeQuantity === undefined ? undefined : Math.min(quantity, row.activeQuantity),
            });
          }} /></label>
        {group === 'drone' && <label>{m.active}<input type="number" min={0} max={row.quantity}
          value={row.activeQuantity ?? active ?? ''} onChange={event => {
            const activeQuantity = event.target.valueAsNumber;
            if (Number.isSafeInteger(activeQuantity) && activeQuantity >= 0 && activeQuantity <= row.quantity) onEdit(id, { activeQuantity });
          }} /></label>}
        {group === 'drone' && <button className="subtle" aria-pressed={row.activeQuantity === undefined}
          title={m.launchDronesAutomaticallyWithinThe}
          onClick={() => onEdit(id, { activeQuantity: undefined })}>{m.auto}</button>}
      </>}
    </div>
  </div>;
});
