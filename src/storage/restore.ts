import { LocalizedError, msg } from '../i18n/index.ts';
import type { Backup } from '../formats/backup.ts';
import { cleanFit } from '../formats/backup.ts';
import { transact } from './database.ts';
import { libraryStores, readLibrary, readLibraryTransaction } from './library.ts';
import type { LibraryData } from './library.ts';

const recordStores = ['fits', 'profiles', 'conditions'] as const;
interface Conflict {
  store: (typeof recordStores)[number];
  id: string;
  name: string;
}

export function restoreConflicts(backup: Backup, local: LibraryData): Conflict[] {
  return recordStores.flatMap(store => {
    const current = new Map(local[store].map(item => [item.id, item]));
    return backup[store].flatMap(record => {
      const old = current.get(record.id);
      const comparable = old && (store === 'fits' ? cleanFit(old) : old);
      return old && JSON.stringify(comparable) !== JSON.stringify(record)
        ? [{ store, id: record.id, name: 'name' in record ? record.name : record.id }] : [];
    });
  });
}

export async function prepareRestore(backup: Backup) {
  const local = await readLibrary();
  return { backup, conflicts: restoreConflicts(backup, local), expectedState: JSON.stringify(local) };
}

export async function applyRestore(prepared: Awaited<ReturnType<typeof prepareRestore>>, replace: boolean): Promise<void> {
  if (prepared.conflicts.length && !replace) throw new LocalizedError(msg('confirmReplacementBeforeRestoringThese'));
  await transact(libraryStores, 'readwrite', async transaction => {
    const local = await readLibraryTransaction(transaction);
    if (JSON.stringify(local) !== prepared.expectedState) throw new LocalizedError(msg('theLibraryChangedInAnother'));
    const changed = new Set(prepared.conflicts.map(conflict => `${conflict.store}:${conflict.id}`));
    for (const store of recordStores) {
      const target = transaction.objectStore(store);
      const existing = new Map(local[store].map(record => [record.id, record]));
      for (const record of prepared.backup[store]) {
        if (!existing.has(record.id)) target.put(record);
        else if (changed.has(`${store}:${record.id}`)) {
          if (store === 'fits' && 'revision' in record) {
            const revision = (existing.get(record.id) as typeof record).revision;
            target.put({ ...record, revision: Math.max(revision, record.revision) + 1 });
          } else target.put(record);
        }
      }
    }
    transaction.objectStore('settings').put(prepared.backup.settings, 'editor');
  });
}
