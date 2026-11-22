import { LocalizedError, msg } from '../i18n/index.ts';
import { en as m } from '../i18n/en.ts';
import type { Fit } from '../domain/fit.ts';
import { copyFit, validateFitItems } from '../domain/fit.ts';
import type { SkillProfile } from '../domain/skills.ts';
import { presetSkills, validateSkillLevels } from '../domain/skills.ts';
import type { FitConditions } from '../domain/conditions.ts';
import { readRequest, transact } from './database.ts';

export interface Settings {
  formatVersion: 1;
  activeFitId?: string;
  exportFormat?: 'eft' | 'xml' | 'dna' | 'json';
  editorPanel?: 'catalog' | 'editor' | 'stats';
}
export interface LibraryData {
  fits: Fit[];
  profiles: SkillProfile[];
  conditions: FitConditions[];
  settings: Settings;
}

export const libraryStores = ['fits', 'profiles', 'conditions', 'settings'] as const;
type Dependencies = { profile?: SkillProfile; conditions?: FitConditions };
const defaults: Settings = { formatVersion: 1 };

export function readLibraryTransaction(transaction: IDBTransaction): Promise<LibraryData> {
  const request = <T>(store: string) => readRequest<T[]>(transaction.objectStore(store).getAll());
  return Promise.all([
    request<Fit>('fits'), request<SkillProfile>('profiles'), request<FitConditions>('conditions'),
    readRequest<Settings | undefined>(transaction.objectStore('settings').get('editor')),
  ]).then(([fits, profiles, conditions, settings]) => ({ fits, profiles, conditions, settings: settings ?? defaults }));
}

export function readLibrary(): Promise<LibraryData> {
  return transact(libraryStores, 'readonly', readLibraryTransaction);
}

export function searchLibrary(data: readonly Fit[], query = ''): Fit[] {
  const needle = query.trim().toLowerCase();
  return data.filter(fit => fit.name.toLowerCase().includes(needle)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveProfile(profile: SkillProfile): Promise<void> {
  if (!['custom', 'eve'].includes(profile.source) || Object.hasOwn(presetSkills, profile.id)) throw new LocalizedError(msg('invalidProfileId'));
  validateSkillLevels(profile.levels);
  return transact('profiles', 'readwrite', transaction => { transaction.objectStore('profiles').put(profile); });
}

export function saveFit(fit: Fit, dependencies: Dependencies = {}): Promise<Fit> {
  const structuralWarnings = validateFitItems(fit.items);
  return transact(libraryStores, 'readwrite', async transaction => {
    const fits = transaction.objectStore('fits');
    const profiles = transaction.objectStore('profiles');
    const conditions = transaction.objectStore('conditions');
    const current = await readRequest<Fit | undefined>(fits.get(fit.id));
    if ((current?.revision ?? 0) !== fit.revision) throw new LocalizedError(msg('staleFitOnSave'));
    if (dependencies.profile) {
      if (Object.hasOwn(presetSkills, dependencies.profile.id)) throw new LocalizedError(msg('cannotReplaceASkillPreset'));
      validateSkillLevels(dependencies.profile.levels);
      profiles.put(dependencies.profile);
    }
    if (dependencies.conditions) conditions.put(dependencies.conditions);
    const profileExists = Object.hasOwn(presetSkills, fit.skillProfileId) || await readRequest(profiles.getKey(fit.skillProfileId));
    if (!profileExists || (fit.conditionsId && !await readRequest(conditions.getKey(fit.conditionsId)))) {
      throw new LocalizedError(msg('missingFitProfileOrConditions'));
    }
    const name = fit.name.trim();
    if (!name) throw new LocalizedError(msg('enterAFitName'));
    const saved: Fit = { ...fit, name, revision: fit.revision + 1, updatedAt: new Date().toISOString(),
      status: structuralWarnings.length ? 'draft' : fit.status };
    fits.put(saved);
    const settingsStore = transaction.objectStore('settings');
    const settings = await readRequest<Settings | undefined>(settingsStore.get('editor'));
    settingsStore.put({ ...defaults, ...settings, activeFitId: saved.id }, 'editor');
    return saved;
  });
}

export function duplicateFit(fit: Fit, name = m.fitCopyName(fit.name), dependencies: Dependencies = {}): Promise<Fit> {
  return saveFit(copyFit(fit, name), dependencies);
}

export function deleteFit(fit: Fit): Promise<void> {
  return transact(['fits', 'settings'], 'readwrite', async transaction => {
    const fits = transaction.objectStore('fits');
    const current = await readRequest<Fit | undefined>(fits.get(fit.id));
    if (current?.revision !== fit.revision) throw new LocalizedError(msg('staleFitOnDelete'));
    fits.delete(fit.id);
    const settings = transaction.objectStore('settings');
    const saved = await readRequest<Settings | undefined>(settings.get('editor'));
    if (saved?.activeFitId === fit.id) settings.put({ ...saved, activeFitId: undefined }, 'editor');
  });
}

export async function importFits(records: readonly Fit[]): Promise<Fit[]> {
  return transact(libraryStores, 'readwrite', transaction => {
    const fits = transaction.objectStore('fits');
    const stored = records.map(record => copyFit(record));
    for (const fit of stored) {
      if (!fit.name.trim() || validateFitItems(fit.items).length) throw new LocalizedError(msg('fittingImportHasInvalidEntries'));
      fit.revision = 1;
      fit.status = 'draft';
      fits.add(fit);
    }
    const first = stored[0];
    if (first) {
      const settings = transaction.objectStore('settings');
      return readRequest<Settings | undefined>(settings.get('editor')).then(current => {
        settings.put({ ...defaults, ...current, activeFitId: first.id }, 'editor');
        return stored;
      });
    }
    return stored;
  });
}
