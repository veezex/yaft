import { LanguageSelect, useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, localizedName, msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { authorize, clientId } from '../esi/sso.ts';
import contract from '../esi/contract.snapshot.json';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isSlotGroup, newFit } from '../domain/fit.ts';
import type { Fit, FitItem } from '../domain/fit.ts';
import { presetSkills } from '../domain/skills.ts';
import type { SkillProfile } from '../domain/skills.ts';
import { updateCatalog } from '../storage/catalog-update.ts';
import { openCatalog, upgradeStarterCatalog } from '../storage/catalog-bootstrap.ts';
import type { CatalogType, FrozenRelease } from '../storage/catalog-contract.ts';
import { checkCompatibleCharges, createFittingWorker } from '../fitting/worker-client.ts';
import type { CalculationResult } from '../fitting/worker-protocol.ts';
import { deleteFit, duplicateFit, readLibrary, saveFit, saveProfile } from '../storage/library.ts';
import type { LibraryData } from '../storage/library.ts';
import { BackupDialog as BackupDialogView, downloadOpenFit } from './BackupDialog.tsx';
import { CatalogPanel as CatalogPanelView } from './CatalogPanel.tsx';
import type { CatalogMode } from './CatalogPanel.tsx';
import { CatalogVersion as CatalogVersionView } from './CatalogVersion.tsx';
import { ConditionsPanel as ConditionsPanelView, newConditions } from './ConditionsPanel.tsx';
import type { FitConditions } from '../domain/conditions.ts';
import { FitComparison } from './FitComparison.tsx';
import { FitEditor } from './FitEditor.tsx';
import { OfflineStatus as OfflineStatusView } from './OfflineStatus.tsx';
import { FitStats } from './FitStats.tsx';
import { TransferDialog } from './TransferDialog.tsx';
import { LibraryPanel as LibraryPanelView } from './LibraryPanel.tsx';
import './editor.css';

const emptyLibrary: LibraryData = { fits: [], profiles: [], conditions: [], settings: { formatVersion: 1 } };
type WorkspacePanel = 'catalog' | 'editor' | 'stats';
type CalculationInput = {
  fitId: string;
  shipTypeId: number;
  modeTypeId?: number;
  items: FitItem[];
  profile: SkillProfile;
  conditions?: FitConditions;
};
type ChargeTarget = { itemId: string; moduleTypeId: number };
const CatalogPanel = memo(CatalogPanelView);
const CatalogVersion = memo(CatalogVersionView);
const ConditionsPanel = memo(ConditionsPanelView);
const LibraryPanel = memo(LibraryPanelView);
const BackupDialog = memo(BackupDialogView);
const OfflineStatus = memo(OfflineStatusView);
const Editor = memo(FitEditor);
const Stats = memo(FitStats);
const Comparison = memo(FitComparison);
const Transfer = memo(TransferDialog);

const workspacePanels = ['catalog', 'editor', 'stats'] as const;

function fitGroup(type: CatalogType, cargo: boolean): FitItem['group'] {
  if (cargo) return 'cargo';
  if (type.slot) return type.slot;
  if (type.categoryId === 18) return 'drone';
  if (type.categoryId === 87) return 'fighter';
  return 'cargo';
}

async function initializeWorker(compatibilityId: string) {
  const connection = createFittingWorker(compatibilityId);
  try {
    await connection.request({ kind: 'initialize' });
    return connection;
  } catch (error) {
    connection.close();
    throw error;
  }
}

export function App() {
  const { locale, m, text } = useLocale();
  const [worker, setWorker] = useState<ReturnType<typeof createFittingWorker>>();
  const [catalog, setCatalog] = useState<FrozenRelease>();
  const [checking, setChecking] = useState(false);
  const [updateText, setUpdateText] = useState<Text>('');
  const [library, setLibrary] = useState<LibraryData>(emptyLibrary);
  const [fit, setFit] = useState<Fit>();
  const [initialConditions] = useState(newConditions);
  const [scratchConditions, setScratchConditions] = useState<{ fitId: string; data: FitConditions }>();
  const [known, setKnown] = useState<Record<number, CatalogType>>({});
  const [computed, setComputed] = useState<CalculationInput & { result: CalculationResult }>();
  const [calculationFailure, setCalculationFailure] = useState<CalculationInput & { compatibilityId: string }>();
  const [mode, setMode] = useState<CatalogMode>('hulls');
  const [panel, setPanel] = useState<WorkspacePanel>('catalog');
  const [chargeTarget, setChargeTarget] = useState<ChargeTarget>();
  const [replaceTarget, setReplaceTarget] = useState<string>();
  const [error, setError] = useState<Text>('');
  const [saving, setSaving] = useState(false);
  const { id: fitId, shipTypeId, modeTypeId, items } = fit ?? {};
  const equipmentContext = useMemo(() => ({ worker, fitId, shipTypeId, mode, replaceTarget }),
    [worker, fitId, shipTypeId, mode, replaceTarget]);
  const [catalogToast, setCatalogToast] = useState<{ context: typeof equipmentContext; id: number; message: Text }>();
  const catalogSelection = useRef({ worker, fit, mode, chargeTarget, replaceTarget, equipmentContext });
  const latestChargeSelection = useRef(0);
  const latestReplacementSelection = useRef(0);
  useLayoutEffect(() => {
    catalogSelection.current = { worker, fit, mode, chargeTarget, replaceTarget, equipmentContext };
  }, [worker, fit, mode, chargeTarget, replaceTarget, equipmentContext]);

  const dismissCatalogToast = useCallback(() => setCatalogToast(undefined), []);
  useEffect(() => {
    if (!catalogToast) return;
    const timer = setTimeout(() => setCatalogToast(current => current === catalogToast ? undefined : current), 5000);
    return () => clearTimeout(timer);
  }, [catalogToast]);

  const showError = useCallback((reason: unknown) => {
    setError(errorText(reason));
  }, []);
  const refreshLibrary = useCallback(() => readLibrary().then(setLibrary).catch(showError), [showError]);

  useEffect(() => {
    let disposed = false;
    let connection: ReturnType<typeof createFittingWorker> | undefined;
    openCatalog().then(async manifest => {
      if (disposed) return;
      connection = createFittingWorker(manifest.compatibilityId);
      await connection.request({ kind: 'initialize' });
      if (!disposed) {
        setCatalog(manifest);
        setWorker(connection);
      }
    }).catch(reason => { if (!disposed) showError(reason); });
    return () => { disposed = true; connection?.close(); };
  }, [showError]);

  useEffect(() => {
    let current = true;
    readLibrary().then(data => {
      if (!current) return;
      setLibrary(data);
      const last = data.fits.find(saved => saved.id === data.settings.activeFitId);
      if (last) {
        setFit(open => open ?? last);
        setMode('equipment');
        setPanel('editor');
      }
    }).catch(reason => { if (current) showError(reason); });
    return () => { current = false; };
  }, [showError]);

  useEffect(() => () => worker?.retire(), [worker]);

  useEffect(() => {
    if (!worker || !catalog || catalog.localizedLabelsVersion) return;
    let active = true;
    let upgrading = false;
    async function upgrade() {
      if (!catalog || upgrading) return;
      upgrading = true;
      try {
        const manifest = await upgradeStarterCatalog(catalog);
        if (!manifest || !active) return;
        const replacement = await initializeWorker(manifest.compatibilityId);
        if (!active || catalogSelection.current.worker !== worker) {
          replacement.close();
          return;
        }
        setCatalog(manifest);
        setWorker(replacement);
        setKnown({});
      } catch {
        // Keep the usable catalog if the download or verification fails.
      } finally {
        upgrading = false;
      }
    }
    const onOnline = () => void upgrade();
    onOnline();
    window.addEventListener('online', onOnline);
    return () => { active = false; window.removeEventListener('online', onOnline); };
  }, [catalog, worker]);

  const checkCatalog = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    setUpdateText(msg('checkingChannel'));
    try {
      const { manifest } = await updateCatalog(worker?.compatibilityId);
      if (manifest && manifest.compatibilityId !== worker?.compatibilityId) {
        const replacement = await initializeWorker(manifest.compatibilityId);
        setCatalog(manifest);
        setWorker(replacement);
        setKnown({});
        setUpdateText(msg('catalogUpdatedTo', manifest.sdeReleaseId));
      } else setUpdateText(msg('catalogIsUpToDate'));
    } catch (error) {
      setUpdateText(errorText(error));
    } finally {
      setChecking(false);
    }
  }, [checking, worker]);

  const profile = library.profiles.find(profile => profile.id === fit?.skillProfileId) ??
    presetSkills[fit?.skillProfileId as keyof typeof presetSkills] ?? presetSkills['all-v'];
  const conditions = scratchConditions && scratchConditions.fitId === fit?.id
    ? scratchConditions.data
    : library.conditions.find(condition => condition.id === fit?.conditionsId);
  const missingTypes = useMemo(() => [...new Set([shipTypeId, modeTypeId,
    ...(items ?? []).flatMap(item => [item.typeId, item.charge?.typeId])])]
    .filter((id): id is number => id !== undefined && !known[id]).sort((a, b) => a - b).join(','), [shipTypeId, modeTypeId, items, known]);
  useEffect(() => {
    const input = catalogSelection.current.fit;
    if (!worker || !input || !fitId || shipTypeId === undefined || !items) return;
    const calculation = { fitId, shipTypeId, modeTypeId, items, profile, conditions };
    let current = true;
    worker.request({ kind: 'calculate', fit: input, fitRevision: input.revision, profile, conditions })
      .then(result => {
        if (!current) return;
        setCalculationFailure(undefined);
        setComputed({ ...calculation, result });
      })
      .catch(reason => {
        if (!current) return;
        setCalculationFailure({ ...calculation, compatibilityId: worker.compatibilityId });
        showError(reason);
      });
    return () => { current = false; };
  }, [worker, fitId, shipTypeId, modeTypeId, items, profile, conditions, showError]);

  useEffect(() => {
    if (!worker || !missingTypes) return;
    const typeIds = missingTypes.split(',').map(Number);
    let current = true;
    Promise.all(Array.from({ length: Math.ceil(typeIds.length / 100) }, (_, page) =>
      worker.request({ kind: 'search', query: '', typeIds: typeIds.slice(page * 100, (page + 1) * 100),
        includeUnpublished: true, offset: 0, limit: 100 })))
      .then(pages => {
        const loaded = pages.flatMap(page => page.results);
        if (current && loaded.length) setKnown(previous => ({
          ...previous,
          ...Object.fromEntries(loaded.filter(type => !previous[type.typeId]).map(type => [type.typeId, type])),
        }));
      }).catch(reason => { if (current) showError(reason); });
    return () => { current = false; };
  }, [worker, missingTypes, showError]);

  const isCurrent = (input?: CalculationInput) => input?.fitId === fitId && input?.items === items &&
    input?.shipTypeId === shipTypeId && input?.modeTypeId === modeTypeId &&
    input?.profile === profile && input.conditions === conditions;
  const result = computed && isCurrent(computed) &&
    computed.result.compatibilityId === worker?.compatibilityId ? computed.result : undefined;
  const displayedResult = fit && computed?.fitId === fit.id && computed.shipTypeId === fit.shipTypeId &&
    computed.result.compatibilityId === worker?.compatibilityId ? computed.result : undefined;
  const failed = calculationFailure && isCurrent(calculationFailure) && calculationFailure.compatibilityId === worker?.compatibilityId;
  const calculating = Boolean(fit && worker && !result && !failed);
  const chargeModuleTypeId = fit?.items.find(item => item.id === chargeTarget?.itemId && item.typeId === chargeTarget.moduleTypeId)?.typeId;

  const openFit = useCallback((selected: Fit) => {
    setError('');
    setFit(selected);
    setMode('equipment');
    setPanel('editor');
    setChargeTarget(undefined);
    setReplaceTarget(undefined);
  }, []);

  const selectType = useCallback(async (type: CatalogType, cargo: boolean) => {
    const { worker, fit, mode, chargeTarget, replaceTarget, equipmentContext } = catalogSelection.current;
    setError('');
    if (mode === 'charge') {
      if (!fit || !worker || !chargeTarget) return;
      const selection = ++latestChargeSelection.current;
      function isCurrent() {
        const current = catalogSelection.current;
        return latestChargeSelection.current === selection && current.worker === worker &&
          current.fit?.id === fit?.id && current.chargeTarget === chargeTarget;
      }
      try {
        const compatible = await checkCompatibleCharges(worker, chargeTarget.moduleTypeId, [type.typeId]);
        if (!isCurrent()) return;
        if (!compatible.has(type.typeId)) {
          setError(msg('incompatibleSelectedCharge'));
          return;
        }
        const { itemId, moduleTypeId } = chargeTarget;
        if (!catalogSelection.current.fit?.items.some(row => row.id === itemId && row.typeId === moduleTypeId)) return;
        setFit(current => current?.id === fit.id ? { ...current, items: current.items.map(row =>
          row.id === itemId && row.typeId === moduleTypeId ? { ...row, charge: { typeId: type.typeId } } : row,
        ) } : current);
        setKnown(previous => ({ ...previous, [type.typeId]: type }));
        setChargeTarget(undefined);
        setMode('equipment');
        setPanel('editor');
      } catch (reason) {
        if (isCurrent()) showError(reason);
      }
      return;
    }
    if (mode === 'hulls') {
      setKnown(previous => ({ ...previous, [type.typeId]: type }));
      if (fit) {
        setFit({ ...fit, shipTypeId: type.typeId, modeTypeId: undefined });
        setMode('equipment');
        setPanel('editor');
      } else openFit(newFit(type.typeId, m.defaultFitName(localizedName(locale, type.names) ?? m.hull)));
      return;
    }
    if (!fit) { setError(msg('hullRequiredForEquipment')); return; }
    const group = fitGroup(type, cargo);
    const replacement = fit.items.find(row => row.id === replaceTarget);
    const selection = replacement && ++latestReplacementSelection.current;
    const isReplacement = (row: FitItem) => row.id === replaceTarget && row.typeId === replacement?.typeId;
    if (group !== 'cargo') {
      if (!worker) return;
      let message: Text | undefined;
      try {
        const result = await worker.request({ kind: 'validate-equipment', hullTypeId: fit.shipTypeId, typeId: type.typeId });
        message = result.warning;
      } catch (reason) {
        message = errorText(reason);
      }
      const current = catalogSelection.current;
      if (current.equipmentContext !== equipmentContext ||
          (replacement && (selection !== latestReplacementSelection.current || !current.fit?.items.some(isReplacement)))) return;
      if (message !== undefined) {
        setCatalogToast(current => ({ context: equipmentContext, id: (current?.id ?? 0) + 1, message }));
        return;
      }
    }
    const id = replacement?.id ?? crypto.randomUUID();
    setFit(current => {
      if (current?.id !== fit.id || current.shipTypeId !== fit.shipTypeId) return current;
      const previous = replacement && current.items.find(isReplacement);
      if (replacement && !previous) return current;
      const sameGroup = previous?.group === group;
      const remaining = previous ? current.items.filter(row => row.id !== previous.id) : current.items;
      let position = sameGroup ? previous.position : undefined;
      if (isSlotGroup(group) && position === undefined) {
        const used = new Set(remaining.filter(row => row.group === group).map(row => row.position));
        position = 0;
        while (used.has(position)) position++;
      }
      const item: FitItem = {
        id, group, typeId: type.typeId, position,
        quantity: sameGroup ? previous.quantity : 1,
        state: isSlotGroup(group) ? 'online' : undefined,
        activeQuantity: group === 'drone' && sameGroup ? previous.activeQuantity : undefined,
      };
      return { ...current, items: [...remaining, item] };
    });
    setKnown(previous => ({ ...previous, [type.typeId]: type }));
    setReplaceTarget(undefined);
    setPanel('editor');
  }, [locale, m, openFit, showError]);

  const changeCatalogMode = useCallback((mode: CatalogMode) => {
    setMode(mode);
    setChargeTarget(undefined);
    setReplaceTarget(undefined);
  }, []);

  const startFit = useCallback(() => {
    setFit(undefined);
    setMode('hulls');
    setPanel('catalog');
    setChargeTarget(undefined);
    setReplaceTarget(undefined);
  }, []);

  const removeFit = useCallback((deleted: Fit) => {
    deleteFit(deleted).then(() => {
      setFit(current => current?.id === deleted.id ? undefined : current);
      void refreshLibrary();
    }).catch(showError);
  }, [refreshLibrary, showError]);

  const changeConditions = useCallback((data: FitConditions) => {
    if (!fit?.id) return;
    const fitId = fit.id;
    setScratchConditions(previous => ({
      fitId, data: previous?.fitId === fitId ? data : { ...data, id: crypto.randomUUID() },
    }));
  }, [fit?.id]);

  const persist = useCallback(async (copy: boolean) => {
    if (!fit || saving) return;
    const editing = fit;
    setError('');
    setSaving(true);
    const changes: Fit = { ...fit, conditionsId: conditions?.id, status: !result || result.warnings.length ? 'draft' : 'saved' };
    try {
      const saved = await (copy ? duplicateFit(changes, m.fitCopyName(changes.name), { conditions }) : saveFit(changes, { conditions }));
      setFit(current => {
        if (!current || current.id !== editing.id) return current;
        if (current === editing) return saved;
        return copy ? current : { ...current, revision: saved.revision, updatedAt: saved.updatedAt };
      });
      await refreshLibrary();
    } catch (reason) {
      showError(reason);
    } finally {
      setSaving(false);
    }
  }, [fit, saving, conditions, result, refreshLibrary, showError, m]);

  const updateProfile = useCallback(async (value: SkillProfile) => {
    await saveProfile(value);
    await refreshLibrary();
    setFit(current => current && { ...current, skillProfileId: value.id });
  }, [refreshLibrary]);
  const save = useCallback(() => void persist(false), [persist]);
  const copy = useCallback(() => void persist(true), [persist]);
  const download = useCallback(() => {
    if (fit) void downloadOpenFit(fit).catch(showError);
  }, [fit, showError]);
  const chooseCharge = useCallback((id: string) => {
    const moduleTypeId = catalogSelection.current.fit?.items.find(item => item.id === id)?.typeId;
    if (moduleTypeId === undefined) return;
    setReplaceTarget(undefined);
    setChargeTarget({ itemId: id, moduleTypeId });
    setMode('charge');
    setPanel('catalog');
  }, []);
  const replace = useCallback((id: string) => {
    setChargeTarget(undefined);
    setReplaceTarget(id);
    setMode('equipment');
    setPanel('catalog');
  }, []);
  const importFit = useCallback((imported: Fit) => {
    openFit(imported);
    void refreshLibrary();
  }, [openFit, refreshLibrary]);

  return <main className="workspace">
    <header className="workspace-header">
      <div className="brand"><span className="brand-symbol" aria-hidden="true">◇</span>
        <div><h1>{m.yaft}</h1><p>{m.eveFittingWorkspace}</p></div>
      </div>
      <LanguageSelect />
      {clientId && <button className="subtle" onClick={() => {
        const scopes = Object.values(contract.operations).flatMap(operation => operation.scopes);
        authorize(scopes).catch(showError);
      }}>{m.connectEveCharacter}</button>}
      <p role="status" className="catalog-status"><span aria-hidden="true" />{catalog ? m.catalogReady(catalog.sdeReleaseId) : m.loadingFittingCatalog}</p>
    </header>
    {error && <p className="workspace-error" role="alert">{text(error)}<button onClick={() => setError('')}>{m.dismiss}</button></p>}
    <nav className="mobile-navigation segments" aria-label={m.workspace}>
      {workspacePanels.map(tab => <button key={tab} aria-pressed={panel === tab} aria-controls={`workspace-${tab}`}
        onClick={() => setPanel(tab)}>{tab === 'stats' ? m.results : tab === 'editor' ? m.editor : m.catalog}</button>)}
    </nav>
    <div className="workbench" data-panel={panel}>
      <div className="workbench-pane" id="workspace-catalog">
        <CatalogPanel worker={worker} mode={mode} chargeModuleTypeId={chargeModuleTypeId}
          toast={catalogToast?.context === equipmentContext ? catalogToast : undefined} onDismissToast={dismissCatalogToast}
          onMode={changeCatalogMode} onPick={selectType} />
      </div>
      <div className="workbench-pane" id="workspace-editor">
        <Editor fit={fit} worker={worker} known={known} result={displayedResult} canSave={Boolean(result)} profiles={library.profiles} profile={profile}
          onEdit={setFit} onProfile={updateProfile} onSave={save} onCopy={copy} onDownload={download}
          onCharge={chooseCharge} onReplace={replace} saving={saving} />
      </div>
      <div className="workbench-pane" id="workspace-stats">
        <Stats result={displayedResult} fitting={Boolean(fit)} calculating={calculating} />
      </div>
    </div>
    <LibraryPanel fits={library.fits} activeId={fit?.id} onOpen={openFit} onNew={startFit} onDelete={removeFit} />
    {fit && <ConditionsPanel conditions={conditions ?? initialConditions} onChange={changeConditions} />}
    <Comparison fit={fit} saved={library.fits} profile={profile} conditions={conditions} worker={worker} known={known} />
    <Transfer worker={worker} fit={fit} onImport={importFit} />
    <BackupDialog onRestore={refreshLibrary} />
    <OfflineStatus catalogReady={Boolean(catalog && worker)} />
    <CatalogVersion catalog={catalog} busy={checking} updateText={text(updateText)} onUpdate={checkCatalog} />
    {import.meta.env.PROD && <footer><a className="muted" href={import.meta.env.BASE_URL + 'licenses.html'}>{m.licensesAndSource}</a></footer>}
  </main>;
}
