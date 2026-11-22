import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseEft, exportEft } from '../../src/formats/eft.ts';
import { parseXml, exportXml } from '../../src/formats/xml.ts';
import { parseDna, exportDna } from '../../src/formats/dna.ts';
import { buildLookup, resolveTransfer } from '../../src/formats/transfer.ts';
import type { CatalogType, } from '../../src/storage/catalog-contract.ts';

const item = (typeId: number, en: string, categoryId: number, slot?: CatalogType['slot']): CatalogType =>
  ({ typeId, names: { en }, categoryId, category: '', groupId: 0, group: '', segment: '', published: true, slot });
const catalog = buildLookup([
  item(587, 'Rifter', 6), item(593, 'Tristan', 6), item(2889, '200mm AutoCannon II', 7, 'high'),
  item(2048, 'Damage Control II', 7, 'low'), item(185, 'EMP S', 8), item(2456, 'Hobgoblin II', 18),
]);
const inputs = JSON.parse(readFileSync('tests/fixtures/formats/roundtrips.json', 'utf8')) as { format: 'eft' | 'xml' | 'dna'; text: string }[];
const codecs = { eft: [parseEft, exportEft], xml: [parseXml, exportXml], dna: [parseDna, exportDna] } as const;

for (const [index, { format, text }] of inputs.entries()) test(`${format} roundtrip ${index + 1}`, () => {
  const [parse, write] = codecs[format];
  const first = resolveTransfer(parse(text), catalog);
  assert.ok(first.fits.length);
  assert.deepEqual(first.issues, []);
  const second = resolveTransfer(first.fits.flatMap(fit => parse(write(fit, catalog).text)), catalog);
  const shape = (fit: typeof first.fits[number]) => ({
    ship: fit.shipTypeId, items: fit.items.map(item => [item.group, item.typeId, item.quantity, item.charge?.typeId]).sort(),
    name: format === 'dna' ? undefined : fit.name,
    description: format === 'xml' ? fit.description : undefined,
  });
  assert.deepEqual(second.issues, []);
  assert.deepEqual(second.fits.map(shape), first.fits.map(shape));
  assert.notEqual(second.fits[0].id, first.fits[0].id);
});

test('unknown equipment and malformed rows are visible before committing a partial transfer', () => {
  const result = resolveTransfer(parseEft('[Rifter, Partial]\nUnknown module\n200mm AutoCannon II'), catalog);
  assert.equal(result.fits[0].items.length, 1);
  assert.equal(result.issues[0].source, 'Unknown module');
  assert.throws(() => parseXml('<!DOCTYPE fittings SYSTEM "https://example.com"> <fittings/>'), /DOCTYPE/);
  assert.throws(() => parseDna('587:12;0::'), /quantity/);
  assert.ok(exportDna({ ...result.fits[0], items: [{ ...result.fits[0].items[0], state: 'overheated' }] }, catalog).losses.length > 0);
});
