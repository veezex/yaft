import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Plugin } from 'vite';
import { readArtifactTree } from '../data/artifacts.ts';
import { sha256 } from '../data/snapshot.ts';
import { report, run } from '../cli.ts';

export function pinnedCatalog(): Plugin {
  return {
    name: 'yaft-pinned-catalog',
    apply: 'build',
    async buildStart() {
      const reference = JSON.parse(await readFile('public/catalog/bootstrap.json', 'utf8'));
      const { bytes, manifest } = await readArtifactTree('public/catalog');
      if (reference.sha256 !== sha256(bytes) || reference.compatibilityId !== manifest.compatibilityId ||
          reference.url !== '/catalog/manifest.json') throw new Error('Pinned catalog reference mismatch');
    },
  };
}

if (import.meta.main) run(async () => {
  const { values } = parseArgs({ options: { from: { type: 'string' } } });
  if (!values.from) throw new Error('Usage: bootstrap-catalog --from <candidate directory>');
  const { manifest, content, bytes } = await readArtifactTree(values.from);
  const path = resolve('public/catalog');
  await mkdir(resolve(path, 'blobs'), { recursive: true });
  await Promise.all(Array.from(content, ([file, blob]) => writeFile(resolve(path, file), blob)));
  await writeFile(resolve(path, 'manifest.json'), bytes);
  await writeFile(resolve(path, 'bootstrap.json'), JSON.stringify({
    compatibilityId: manifest.compatibilityId, url: '/catalog/manifest.json', sha256: sha256(bytes),
  }, null, 2));
  report({ status: 'staged', path, compatibilityId: manifest.compatibilityId });
});
