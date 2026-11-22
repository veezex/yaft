import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rename, rmdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { ChannelPointer, ReleaseReference } from '../../src/storage/catalog-contract.ts';
import { isIdentifier, isRecord, parseChannelPointer } from '../../src/storage/catalog-contract.ts';
import { workRoot } from '../cli.ts';
import { sha256 } from './snapshot.ts';
import { readArtifactTree } from './artifacts.ts';

export function resolveTarget(name: string) {
  if (name === 'local') return resolve(workRoot, 'updates');
  if (!isIdentifier(name)) throw new Error('Invalid channel target');
  const targets: unknown = JSON.parse(process.env.YAFT_CHANNEL_TARGETS ?? '{}');
  if (!isRecord(targets) || typeof targets[name] !== 'string') throw new Error('Channel target is not configured');
  return resolve(targets[name]);
}

export async function readPointer(directory: string): Promise<ChannelPointer | undefined> {
  try {
    return parseChannelPointer(JSON.parse(await readFile(join(directory, 'current.json'), 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function nextPointer(previous: ChannelPointer | undefined, current: ReleaseReference): ChannelPointer {
  if (previous?.current.compatibilityId === current.compatibilityId && previous.current.sha256 === current.sha256) return previous;
  return { formatVersion: 1, revision: (previous?.revision ?? 0) + 1, publishedAt: new Date().toISOString(),
    current, previous: previous?.current };
}

export async function exclusiveChannel<T>(directory: string, action: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const lock = join(directory, '.writer-lock');
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const current = await readPointer(directory);
    throw new Error(`Another publisher holds this channel. Current revision: ${current?.revision ?? 0}. Retry after it completes.`);
  }
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}

async function atomicWrite(file: string, bytes: string | Buffer): Promise<void> {
  const parent = dirname(file);
  await mkdir(parent, { recursive: true });
  const temp = await mkdtemp(join(parent, '.pending-'));
  const pending = join(temp, 'data');
  try {
    await writeFile(pending, bytes);
    await rename(pending, file);
  } finally {
    await unlink(pending).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await rmdir(temp);
  }
}

export async function switchPointer(directory: string, previous: ChannelPointer | undefined, reference: ReleaseReference) {
  const current = await readPointer(directory);
  if (current?.revision !== previous?.revision) throw new Error('Channel revision changed during verification');
  const next = nextPointer(current, reference);
  if (next !== current) await atomicWrite(join(directory, 'current.json'), JSON.stringify(next, null, 2) + '\n');
  return next;
}

export async function checkPublished(directory: string, reference: ReleaseReference) {
  const path = join(directory, 'releases', reference.compatibilityId, 'manifest.json');
  const bytes = await readFile(path);
  const { parseRelease } = await import('../../src/storage/catalog-contract.ts');
  const manifest = parseRelease(JSON.parse(bytes.toString('utf8')));
  if (sha256(bytes) !== reference.sha256 || manifest.compatibilityId !== reference.compatibilityId) {
    throw new Error('Published manifest does not match the pointer');
  }
  await Promise.all(manifest.files.map(async file => {
    const blob = await readFile(join(directory, file.url));
    if (blob.length !== file.bytes || sha256(blob) !== file.sha256) throw new Error(`Published artifact failed verification: ${file.url}`);
  }));
}

export async function stagePublication(directory: string, candidate: Awaited<ReturnType<typeof readArtifactTree>>) {
  const { manifest, bytes, content } = candidate;
  const id = manifest.compatibilityId;
  const reference = { compatibilityId: id, url: `/updates/releases/${id}/manifest.json`, sha256: sha256(bytes) };
  await Promise.all(Array.from(content, async ([path, buffer]) => {
    const file = join(directory, path);
    try {
      const existing = await readFile(file);
      if (sha256(existing) !== sha256(buffer)) throw new Error(`Immutable blob conflict: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await atomicWrite(file, buffer);
    }
  }));
  const manifestPath = join(directory, 'releases', id, 'manifest.json');
  try {
    if (sha256(await readFile(manifestPath)) !== reference.sha256) throw new Error('Immutable manifest conflict');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await atomicWrite(manifestPath, bytes);
  }
  await checkPublished(directory, reference);
  return reference;
}

export function localChannel(): Plugin {
  return {
    name: 'yaft-local-channel',
    configurePreviewServer(server) {
      const root = resolveTarget('local');
      server.middlewares.use(server.config.base + 'updates', (request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname.slice(1);
        if (request.method !== 'GET' && request.method !== 'HEAD') return next();
        if (!/^(?:current\.json|blobs\/[a-f0-9]{64}\.(?:blob|json)|releases\/[a-z0-9._-]+\/manifest\.json)$/i.test(path)) {
          response.writeHead(404).end();
          return;
        }
        const file = resolve(root, path);
        void stat(file).then(info => {
          response.writeHead(200, {
            'Content-Length': info.size,
            'Content-Type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
            'Cache-Control': path === 'current.json' ? 'no-store' : 'public,max-age=31536000,immutable',
          });
          if (request.method === 'HEAD') response.end();
          else createReadStream(file).on('error', () => response.destroy()).pipe(response);
        }).catch(error => response.writeHead((error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500).end());
      });
    },
  };
}
