import { useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, localizedName } from '../i18n/index.ts';
import type { LabelKey, Text } from '../i18n/index.ts';
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CatalogType } from '../storage/catalog-contract.ts';
import type { createFittingWorker } from '../fitting/worker-client.ts';
import type { WorkerResponse } from '../fitting/worker-protocol.ts';
import { catalogIconKind, TypeIcon } from './TypeIcon.tsx';

export type CatalogMode = 'hulls' | 'equipment' | 'charge';
type Worker = ReturnType<typeof createFittingWorker>;
type SearchPage = Extract<WorkerResponse, { kind: 'search' }>;
const filters = [
  ['allEquipment', [7, 8, 18, 32, 66, 87]],
  ['modules', [7, 66]], ['charges', [8]], ['drones', [18]], ['fighters', [87]], ['subsystems', [32]], ['cargo', []],
] as const satisfies ReadonlyArray<readonly [LabelKey, readonly number[]]>;
const emptyResults: SearchPage['results'] = [];

const CatalogRow = memo(function CatalogRow({ type, hull, cargo, ready, inspecting, fields, attributeError, onPick, onInspect }: {
  type: CatalogType;
  hull: boolean;
  cargo: boolean;
  ready: boolean;
  inspecting: boolean;
  fields?: NonNullable<SearchPage['attributes']>[number];
  attributeError?: Text;
  onPick: (type: CatalogType, cargo: boolean) => void;
  onInspect: (id: number) => void;
}) {
  const { m, locale, text } = useLocale();
  const name = localizedName(locale, type.names) ?? String(type.typeId);
  return <li>
    <div className="catalog-row">
      <TypeIcon type={type} kind={catalogIconKind(type)} />
      <button className="catalog-pick" aria-label={hull ? name : m.addItem(name)} disabled={!ready}
        onClick={() => onPick(type, cargo)} title={name}>
        <span>{name}</span><small>{localizedName(locale, type.groupNames) ?? type.group}</small>
      </button>
      <button className="subtle icon-button" aria-label={m.attributesFor(name)} aria-expanded={inspecting} disabled={!ready}
        onClick={() => onInspect(type.typeId)}>ⓘ</button>
    </div>
    {inspecting && <dl className="item-attributes">
      {attributeError ? <div><dt role="alert">{text(attributeError)}</dt></div> :
        fields?.length ? fields.map((field, index) => <div key={index}>
          <dt>{localizedName(locale, field.names) ?? field.name}</dt>
          <dd>{field.value.toLocaleString(locale, { useGrouping: false, maximumSignificantDigits: 17 })} {localizedName(locale, field.unitNames) ?? field.unit}</dd>
        </div>) : <div><dt>{m.category}</dt><dd>{localizedName(locale, type.categoryNames) ?? type.category}</dd></div>}
    </dl>}
  </li>;
});

export function CatalogPanel({ worker, mode, chargeModuleTypeId, toast, onDismissToast, onMode, onPick }: {
  worker?: Worker;
  mode: CatalogMode;
  chargeModuleTypeId?: number;
  toast?: { id: number; message: Text };
  onDismissToast: () => void;
  onMode: (mode: CatalogMode) => void;
  onPick: (type: CatalogType, cargo: boolean) => void;
}) {
  const { m, text } = useLocale();
  const [filter, setFilter] = useState(0);
  const scope = mode === 'charge' ? `charge:${chargeModuleTypeId}` : mode;
  const [input, setInput] = useState({ scope, query: '', offset: 0 });
  const { query, offset } = input.scope === scope ? input : { query: '', offset: 0 };
  const [page, setPage] = useState<{ worker: Worker; scope: string; key: string; response: SearchPage }>();
  const [failure, setFailure] = useState<{ worker: Worker; key: string; message: Text }>();
  const [inspecting, setInspecting] = useState<number>();
  const [details, setDetails] = useState<{ worker: Worker; id: number; fields?: SearchPage['attributes']; error?: Text }>();
  const list = useRef<HTMLUListElement>(null);
  const key = JSON.stringify([scope, filter, query, offset]);
  const visiblePage = page?.worker === worker ? page : undefined;
  const currentPage = visiblePage?.key === key ? visiblePage.response : undefined;
  const error = failure?.worker === worker && failure?.key === key ? failure.message : undefined;
  const canSearch = mode !== 'charge' || chargeModuleTypeId !== undefined;
  const pending = !currentPage && !error && canSearch;
  const results = !error && canSearch ? visiblePage?.response.results ?? emptyResults : emptyResults;
  const next = currentPage?.nextOffset ?? null;
  const visibleDetails = details?.worker === worker && details?.id === inspecting ? details : undefined;
  const effectiveMode = pending && visiblePage ? visiblePage.scope.split(':')[0] : mode;

  useEffect(() => {
    if (!worker || (mode === 'charge' && chargeModuleTypeId === undefined)) return;
    let current = true;
    const categoryIds = mode === 'hulls' ? [6, 65] : mode === 'charge' ? [8] : [...filters[filter][1]];
    worker.request({ kind: 'search', query, categoryIds,
      moduleTypeId: mode === 'charge' ? chargeModuleTypeId : undefined, offset, limit: 25 }).then(response => {
      if (!current) return;
      setPage({ worker, scope, key, response });
      setFailure(undefined);
    }).catch(reason => { if (current) setFailure({ worker, key, message: errorText(reason) }); });
    return () => { current = false; };
  }, [worker, mode, scope, key, filter, query, offset, chargeModuleTypeId]);

  useLayoutEffect(() => {
    if (currentPage && list.current) list.current.scrollTop = 0;
  }, [currentPage]);

  useEffect(() => {
    if (!worker || inspecting === undefined) return;
    let current = true;
    worker.request({ kind: 'search', query: '', offset: 0, limit: 1, typeIds: [inspecting],
      includeUnpublished: true, includeAttributes: true }).then(result => {
      if (current) setDetails({ worker, id: inspecting, fields: result.attributes });
    }).catch(reason => {
      if (current) setDetails({ worker, id: inspecting, error: errorText(reason) });
    });
    return () => { current = false; };
  }, [worker, inspecting]);

  function changeMode(value: CatalogMode) {
    setInput({ scope: value, query: '', offset: 0 });
    setInspecting(undefined);
    onMode(value);
  }

  const viewAttributes = useCallback((id: number) => setInspecting(previous => previous === id ? undefined : id), []);

  const label = mode === 'hulls' ? m.searchHulls : mode === 'equipment' ? m.searchEquipment :
    m.searchCharges;
  return <section className="catalog panel" aria-label={m.catalog}>
    <header className="panel-heading"><h2>{m.catalog}</h2></header>
    <div className="segments catalog-modes" aria-label={m.catalogCategory}>
      <button aria-pressed={mode === 'hulls'} onClick={() => changeMode('hulls')}>{m.hulls}</button>
      <button aria-pressed={mode === 'equipment'} onClick={() => changeMode('equipment')}>{m.equipment}</button>
      {mode === 'charge' && <button aria-pressed>{m.charges}</button>}
    </div>
    <div className="catalog-fields">
      <label className="field">{label}
        <input type="search" value={query} onChange={event => setInput({ scope, query: event.target.value, offset: 0 })}
          disabled={!worker} placeholder={mode === 'hulls' ? m.hullSearchExample : m.searchByNameOrId} />
      </label>
      <label className="field" data-hidden={mode !== 'equipment'}>{m.category}
        <select disabled={mode !== 'equipment'} value={filter} onChange={event => {
          setFilter(Number(event.target.value));
          setInput({ scope, query, offset: 0 });
        }}>
          {filters.map(([name], index) => <option key={index} value={index}>{m[name]}</option>)}
        </select>
      </label>
    </div>
    <div className="catalog-results">
      <ul ref={list} className="catalog-items" aria-busy={pending}>
        {error && <li className="catalog-message" role="alert">{text(error)}</li>}
        {!error && !results.length && <li className="catalog-message muted">{pending ? m.searchingCatalog :
          mode === 'charge' && chargeModuleTypeId === undefined ? m.chargePickerWithoutModule : m.noMatches}</li>}
        {results.map(type => <CatalogRow key={type.typeId} type={type} hull={effectiveMode === 'hulls'}
          cargo={filter === 6 && mode === 'equipment'} ready={Boolean(currentPage)} inspecting={inspecting === type.typeId}
          fields={visibleDetails?.fields?.[type.typeId]} attributeError={inspecting === type.typeId ? visibleDetails?.error : undefined}
          onPick={onPick} onInspect={viewAttributes} />)}
      </ul>
      <div className="catalog-toast" data-active={Boolean(toast)}>
        <p role="alert">{toast && <span key={toast.id}>{text(toast.message)}</span>}</p>
        {toast && <button className="subtle" onClick={onDismissToast}>{m.dismiss}</button>}
      </div>
    </div>
    <div className="actions paging" data-hidden={offset === 0 && (visiblePage?.response.nextOffset ?? null) === null}>
      <button disabled={!currentPage || !offset}
        onClick={() => setInput({ scope, query, offset: Math.max(0, offset - 25) })}>{m.previous}</button>
      <button disabled={next === null} onClick={() => next !== null && setInput({ scope, query, offset: next })}>{m.next}</button>
    </div>
  </section>;
}
