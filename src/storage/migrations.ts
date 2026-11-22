export const databaseVersion = 1;
export const userStores = ['fits', 'profiles', 'conditions', 'settings', 'characters'] as const;
export const catalogStores = ['catalogs', 'artifacts', 'catalogPointer'] as const;
export type StoreName = (typeof userStores)[number] | (typeof catalogStores)[number];

export function migrateDatabase(database: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    database.createObjectStore('fits', { keyPath: 'id' });
    database.createObjectStore('profiles', { keyPath: 'id' });
    database.createObjectStore('conditions', { keyPath: 'id' });
    database.createObjectStore('settings');
    database.createObjectStore('characters', { keyPath: 'characterId' });
    database.createObjectStore('catalogs', { keyPath: 'compatibilityId' });
    database.createObjectStore('artifacts');
    database.createObjectStore('catalogPointer');
  }
}
