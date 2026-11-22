import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { typeMark } from '../../src/app/type-mark.ts';
import type { FrozenRelease } from '../../src/storage/catalog-contract.ts';
import type { CatalogIndex } from '../../src/fitting/dataset.ts';

test('every valid type in the pinned catalog has distinct, compact SVG geometry', () => {
  const root = new URL('../../public/catalog/', import.meta.url);
  const release: FrozenRelease = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  const index = release.files.find(file => file.purpose === 'index')!;
  const data = readFileSync(new URL(index.url, root));
  const { types }: CatalogIndex = JSON.parse((index.encoding === 'gzip' ? gunzipSync(data) : data).toString());
  const seen = new Set<string>();
  for (const { typeId } of types) {
    if (typeId === 0) continue; // SDE sentinel, not a selectable item.

    const path = typeMark(typeId);
    assert.ok(path.length > 0 && path.length < 512);
    assert.ok(!seen.has(path), `Duplicate geometry for type ${typeId}`);
    seen.add(path);
  }
  assert.notEqual(typeMark(1), typeMark(2 ** 32 + 1));
  assert.notEqual(typeMark(Number.MAX_SAFE_INTEGER), typeMark(Number.MAX_SAFE_INTEGER - 1));
});
