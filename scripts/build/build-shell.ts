import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';
import type { Plugin } from 'vite';
import { sha256 } from '../data/snapshot.ts';

export function serviceWorkerShell(): Plugin {
  let base = '/';
  return {
    name: 'yaft-service-worker-shell',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    async writeBundle(output) {
      const directory = resolve(output.dir ?? 'dist');
      if (base !== '/') {
        const manifestPath = resolve(directory, 'manifest.webmanifest');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        Object.assign(manifest, { id: base, scope: base, start_url: base });
        for (const icon of manifest.icons) icon.src = base + icon.src.slice(1);
        const callback = resolve(directory, 'auth/eve/callback');
        await mkdir(callback, { recursive: true });
        await Promise.all([
          writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n'),
          copyFile(resolve(directory, 'index.html'), resolve(callback, 'index.html')),
        ]);
      }
      const assets = await readdir(resolve(directory, 'assets'), { recursive: true, withFileTypes: true });
      const paths = ['/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
        ...assets.filter(entry => entry.isFile()).map(entry =>
          resolve(entry.parentPath, entry.name).slice(directory.length).replaceAll('\\', '/'))].sort();
      const files = paths.map(path => base + path.slice(1));
      const source = await readFile('src/pwa/sw.ts', 'utf8');
      const digests = await Promise.all(paths.map(async path => sha256(await readFile(resolve(directory, '.' + path)))));
      const version = sha256(JSON.stringify([source, files, digests])).slice(0, 24);
      const body = stripTypeScriptTypes(source, { mode: 'strip' });
      const declaration = `const YAFT_SHELL_VERSION = ${JSON.stringify(version)};\nconst YAFT_SHELL_FILES = ${JSON.stringify(files)};\n`;
      await Promise.all([
        writeFile(resolve(directory, 'sw.js'), declaration + body),
        writeFile(resolve(directory, 'shell-manifest.json'), JSON.stringify({ version, files }, null, 2) + '\n'),
      ]);
    },
  };
}
