import { isRecord } from '../../src/storage/catalog-contract.ts';
import { sha256 } from '../data/snapshot.ts';

const base = 'https://esi.evetech.net';
export const approvedDate = '2026-11-19';
export const contractPath = 'src/esi/contract.snapshot.json';
export const openApiUrl = (date: string) => `${base}/meta/openapi.json?compatibility_date=${date}`;

const fitsPath = '/characters/{character_id}/fittings';
const routes = {
  skills: ['get', '/characters/{character_id}/skills', '200', ['esi-skills.read_skills.v1']],
  listFits: ['get', fitsPath, '200', ['esi-fittings.read_fittings.v1']],
  createFit: ['post', fitsPath, '201', ['esi-fittings.write_fittings.v1']],
  deleteFit: ['delete', `${fitsPath}/{fitting_id}`, '204', ['esi-fittings.write_fittings.v1']],
  prices: ['get', '/markets/prices', '200', []],
} as const;

type RecordValue = Record<string, unknown>;
function object(value: unknown, label: string): RecordValue {
  if (!isRecord(value)) throw new Error(`Missing or invalid ${label}`);
  return value;
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}

export function extractContract(bytes: Buffer, date: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error('Use a compatibility date in YYYY-MM-DD format');
  const doc = object(JSON.parse(bytes.toString('utf8')), 'document');
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.1.') ||
      object(doc.info, 'OpenAPI info').version !== date ||
      !Array.isArray(doc.servers) || !doc.servers.some(server => isRecord(server) && server.url === base)) {
    throw new Error('OpenAPI version, server or compatibility date does not match');
  }
  function deref(value: unknown, trail: string[] = []): RecordValue {
    const row = object(value, 'OpenAPI object');
    const ref = row.$ref;
    if (ref === undefined) return row;
    if (typeof ref !== 'string' || !ref.startsWith('#/') || trail.includes(ref) || trail.length >= 32) throw new Error('Unsupported OpenAPI reference');
    const resolved = ref.slice(2).split('/').reduce<unknown>((node, key) => {
      const field = key.replaceAll('~1', '/').replaceAll('~0', '~');
      const record = object(node, ref);
      return Object.hasOwn(record, field) ? record[field] : undefined;
    }, doc);
    const { $ref: _, ...siblings } = row;
    return { ...deref(resolved, [...trail, ref]), ...siblings };
  }
  function shape(value: unknown, depth = 0): RecordValue {
    if (depth > 32) throw new Error('Recursive ESI schema');
    const row = deref(value);
    if (!['object', 'array', 'string', 'integer', 'number', 'boolean'].includes(String(row.type))) {
      throw new Error('Unsupported ESI schema type');
    }
    const output: RecordValue = {};
    const fields = ['type', 'format', 'enum', 'required', 'minLength', 'maxLength', 'minItems', 'maxItems', 'minimum', 'maximum'];
    for (const field of fields) if (Object.hasOwn(row, field)) {
      output[field] = Array.isArray(row[field]) ? [...row[field]].sort() : row[field];
    }
    if (row.items !== undefined) output.items = shape(row.items, depth + 1);
    if (row.properties !== undefined) output.properties = Object.fromEntries(Object.entries(object(row.properties, 'properties'))
      .map(([name, schema]) => [name, shape(schema, depth + 1)]));
    return canonical(output) as RecordValue;
  }
  function body(entry: RecordValue, label: string) {
    const content = object(entry.content, label);
    return shape(object(content['application/json'], label).schema);
  }
  const paths = object(doc.paths, 'ESI paths');
  const operations = Object.fromEntries(Object.entries(routes).map(([key, [method, path, success, requiredScopes]]) => {
    const route = object(paths[path], path);
    const definition = object(route[method], `${method.toUpperCase()} ${path}`);
    const parameters = [...(Array.isArray(route.parameters) ? route.parameters : []),
      ...(Array.isArray(definition.parameters) ? definition.parameters : [])].map(value => deref(value));
    const pathParameters = Object.fromEntries([...path.matchAll(/\{([^}]+)\}/g)].map(match => {
      const name = match[1];
      const input = object(parameters.find(value => value.name === name && value.in === 'path' && value.required === true), name);
      const schema = shape(input.schema);
      if (schema.type !== 'integer' || schema.format !== 'int64') throw new Error(`Invalid ESI path parameter ${name}`);
      return [name, schema];
    }));
    const dateHeader = object(parameters.find(value => value.in === 'header' && value.name === 'X-Compatibility-Date'), 'compatibility date header');
    const accepted = shape(dateHeader.schema).enum;
    if (!Array.isArray(accepted) || !accepted.includes(date)) throw new Error('Operation compatibility date does not match');
    const alternativeScopes = definition.security;
    const scopes = Array.isArray(alternativeScopes) && alternativeScopes.length === 1
      ? object(alternativeScopes[0], 'OAuth scopes').OAuth2 : alternativeScopes === undefined ? [] : null;
    if (!Array.isArray(scopes) || JSON.stringify([...scopes].sort()) !== JSON.stringify([...requiredScopes].sort())) {
      throw new Error(`Unexpected OAuth scopes for ${key}`);
    }
    const responses = object(definition.responses, 'responses');
    const response = deref(responses[success]);
    return [key, {
      path, method: method.toUpperCase(), success, scopes, pathParameters,
      response: success === '204' ? null : body(response, 'response'),
      request: method === 'post' ? body(deref(definition.requestBody), 'request body') : null,
    }];
  }));
  return { formatVersion: 1, date, source: openApiUrl(date), sha256: sha256(bytes), operations };
}

type Contract = ReturnType<typeof extractContract>;
export function diffContract(previous: Contract, current: Contract): string[] {
  const differences: string[] = [];
  function compare(old: unknown, next: unknown, prefix: string): void {
    if (isRecord(old) && isRecord(next)) {
      for (const key of new Set([...Object.keys(old), ...Object.keys(next)])) compare(old[key], next[key], `${prefix}.${key}`);
    } else if (JSON.stringify(old) !== JSON.stringify(next)) differences.push(prefix);
  }
  compare(previous.operations, current.operations, 'operations');
  return differences;
}
