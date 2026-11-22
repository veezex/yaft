import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { isRecord, isReleaseId, isSha256 } from '../../src/storage/catalog-contract.ts';

export const sdeRoot = 'https://sde.evetech.net/tranquility/';
export const requiredTables = {
  types: 'typeID', groups: 'groupID', categories: 'categoryID',
  marketGroups: 'marketGroupID', metaGroups: 'metaGroupID', typeDogma: 'typeID',
  dogmaAttributes: 'attributeID', dogmaEffects: 'effectID', dogmaUnits: 'unitID',
  dynamicItemAttributes: 'typeID', dbuffCollections: 'dbuffCollectionID', typeBonus: 'typeID',
  cloneGrades: 'cloneGradeID', fighterAbilities: 'fighterAbilityID', fighterAbilitiesByType: 'typeID',
  systemDbuffEmitters: 'typeID', systemWideEffects: 'typeID',
} as const;
const optionalTables = { _changes: 'comparedWith', _schemaChangelog: 'afterBuildNumber' } as const;
type TableName = keyof typeof requiredTables | keyof typeof optionalTables;
type Row = Record<string, unknown>;
interface Table {
  version: string;
  sha256: string;
  schemaSha256: string;
  rows: Row[];
  raw: Buffer;
  schema: Buffer;
}

export interface SdeRelease {
  releaseId: string;
  buildNumber: number;
  releaseDate: string;
  manifest: Buffer;
  manifestSha256: string;
  source: string;
  tables: Record<keyof typeof requiredTables, Table> & Partial<Record<keyof typeof optionalTables, Table>>;
}

export const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const decode = (value: Buffer) => value[0] === 31 && value[1] === 139 ? gunzipSync(value) : value;

export async function fetchBytes(url: URL): Promise<Buffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} from ${url.href}`);
  return decode(Buffer.from(await response.arrayBuffer()));
}

function json(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${label}`, { cause: error });
  }
}

export async function readSnapshot(releaseId: string, directory?: string): Promise<SdeRelease> {
  if (!isReleaseId(releaseId)) throw new Error('Invalid SDE release ID');
  const source = new URL(`${releaseId}/`, sdeRoot);
  const manifest = directory ? decode(await readFile(join(directory, 'manifest.json'))) : await fetchBytes(source);
  const input = json(manifest, 'manifest');
  if (!isRecord(input) || input.release !== releaseId || !Number.isSafeInteger(input.buildNumber) ||
      Number(input.buildNumber) < 1 || typeof input.releaseDate !== 'string' ||
      !Number.isFinite(Date.parse(input.releaseDate)) || !isRecord(input.tables)) {
    throw new Error('Invalid SDE release manifest or release mismatch');
  }
  const entries = input.tables;
  const officialSource = isRecord(entries.types) && isRecord(entries.types.jsonl) &&
    typeof entries.types.jsonl.url === 'string' && entries.types.jsonl.url.startsWith(source.href);
  const ajv = new Ajv2020({ strict: false, validateFormats: false });
  async function content(link: string): Promise<Buffer> {
    const url = new URL(link, source);
    if (directory) {
      const name = url.pathname.split('/').pop();
      if (!name || !/^[a-z0-9_.-]+\.(jsonl|json)$/i.test(name)) throw new Error('Unsafe local SDE file name');
      return decode(await readFile(join(directory, name)));
    }
    if (url.origin !== source.origin || !url.pathname.startsWith(source.pathname)) {
      throw new Error('SDE table does not belong to the pinned release');
    }
    return fetchBytes(url);
  }
  async function table(name: TableName, primaryKey: string): Promise<readonly [TableName, Table]> {
    const entry = entries[name];
    if (!isRecord(entry) || !isSha256(entry.version) || !isRecord(entry.jsonl) ||
        typeof entry.jsonl.url !== 'string' || typeof entry.jsonl.recordSchemaUrl !== 'string') {
      throw new Error(`Invalid table version or links for ${name}`);
    }
    const [raw, schema] = await Promise.all([content(entry.jsonl.url), content(entry.jsonl.recordSchemaUrl)]);
    const document = json(schema, `${name} schema`);
    if (!isRecord(document) || document['x-sde-key'] !== primaryKey || document.type !== 'object' ||
        document.$schema !== 'https://json-schema.org/draft/2020-12/schema') throw new Error(`Invalid schema for ${name}`);
    const validate = ajv.compile(document);
    const seen = new Set<number | string>();
    const rows: Row[] = [];
    for (const line of raw.toString('utf8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const row = json(Buffer.from(line), `${name} row ${rows.length + 1}`);
      if (!isRecord(row) || !validate(row)) throw new Error(`Invalid ${name} row ${rows.length + 1}: ${ajv.errorsText(validate.errors)}`);
      const id = row[primaryKey];
      const validId = name === '_changes' ? typeof id === 'string' : Number.isSafeInteger(id) && Number(id) >= 0;
      if (!validId || seen.has(id as number | string)) throw new Error(`Invalid or duplicate ${name} key: ${id}`);
      seen.add(id as number | string);
      rows.push(row);
    }
    return [name, { raw, schema, rows, version: entry.version, sha256: sha256(raw), schemaSha256: sha256(schema) }];
  }

  const targets = Object.entries({ ...requiredTables, ...optionalTables })
    .filter(([name]) => name in requiredTables || Object.hasOwn(entries, name)) as [TableName, string][];
  const tables = Object.fromEntries(await Promise.all(targets.map(([name, key]) => table(name, key)))) as SdeRelease['tables'];
  verifyReferences(tables);
  return {
    releaseId, buildNumber: Number(input.buildNumber), releaseDate: input.releaseDate,
    manifest, manifestSha256: sha256(manifest), source: officialSource || !directory ? source.href : 'local SDE snapshot', tables,
  };
}

function verifyReferences(tables: SdeRelease['tables']): void {
  const keys = {
    types: new Set(tables.types.rows.map(row => row.typeID)),
    groups: new Set(tables.groups.rows.map(row => row.groupID)),
    categories: new Set(tables.categories.rows.map(row => row.categoryID)),
    marketGroups: new Set(tables.marketGroups.rows.map(row => row.marketGroupID)),
    metaGroups: new Set(tables.metaGroups.rows.map(row => row.metaGroupID)),
    attributes: new Set(tables.dogmaAttributes.rows.map(row => row.attributeID)),
    effects: new Set(tables.dogmaEffects.rows.map(row => row.effectID)),
    abilities: new Set(tables.fighterAbilities.rows.map(row => row.fighterAbilityID)),
  };
  function requireKey(target: keyof typeof keys, id: unknown, source: string) {
    if (!keys[target].has(id)) throw new Error(`${source}: missing ${target} reference ${id}`);
  }
  for (const row of tables.groups.rows) requireKey('categories', row.categoryID, 'groups');
  for (const row of tables.types.rows) {
    requireKey('groups', row.groupID, `types ${row.typeID}`);
    if (row.marketGroupID !== undefined) requireKey('marketGroups', row.marketGroupID, `types ${row.typeID}`);
    if (row.metaGroupID !== undefined) requireKey('metaGroups', row.metaGroupID, `types ${row.typeID}`);
  }
  for (const row of tables.typeDogma.rows) {
    const source = `typeDogma ${row.typeID}`;
    requireKey('types', row.typeID, source);
    if (!Array.isArray(row.dogmaAttributes) || !Array.isArray(row.dogmaEffects)) throw new Error(`Invalid ${source} entries`);
    for (const attribute of row.dogmaAttributes) {
      requireKey('attributes', attribute.attributeID, source);
      if (!Number.isFinite(attribute.value)) throw new Error(`Invalid ${source} attribute value`);
    }
    for (const effect of row.dogmaEffects) requireKey('effects', effect.effectID, source);
  }
  for (const name of ['typeBonus', 'dynamicItemAttributes', 'fighterAbilitiesByType', 'systemDbuffEmitters', 'systemWideEffects'] as const) {
    for (const row of tables[name].rows) requireKey('types', row.typeID, name);
  }
  for (const row of tables.fighterAbilitiesByType.rows) {
    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith('abilitySlot') && isRecord(value)) requireKey('abilities', value.abilityID, 'fighterAbilitiesByType');
    }
  }
}
