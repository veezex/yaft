import { LocalizedError, msg } from '../i18n/index.ts';
import { catalogStores, databaseVersion, migrateDatabase } from './migrations.ts';
import type { StoreName } from './migrations.ts';

export const databaseName = 'yaft';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = event => migrateDatabase(request.result, event.oldVersion);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  });
}

export function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function transact<T>(
  names: StoreName | readonly StoreName[],
  mode: IDBTransactionMode,
  work: (transaction: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(typeof names === 'string' ? names : [...names], mode);
    const complete = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new LocalizedError(msg('storageTransactionWasAborted')));
    });
    const execute = async () => {
      try {
        return await work(transaction);
      } catch (error) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have ended in response to a request failure.
        }
        throw error;
      }
    };
    const [result] = await Promise.all([execute(), complete]);
    return result;
  } finally {
    db.close();
  }
}

export async function clearCatalog(): Promise<void> {
  await transact(catalogStores, 'readwrite', transaction => {
    for (const name of catalogStores) transaction.objectStore(name).clear();
  });
}
