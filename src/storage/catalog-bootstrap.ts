import { LocalizedError, msg } from '../i18n/index.ts';
import type { FrozenRelease, ReleaseReference } from './catalog-contract.ts';
import { activateCatalog, downloadCatalog, getActivePointer, installedRelease, loadRelease, verifyInstalledFiles } from './catalog-store.ts';

const bootstrapURL = import.meta.env.BASE_URL + 'catalog/bootstrap.json';

async function readStarterRelease() {
  const response = await fetch(bootstrapURL, { cache: 'no-cache', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new LocalizedError(msg('downloadTheStarterCatalogWhile'));
  const reference = await response.json() as ReleaseReference;
  const source = new URL(reference.url, location.origin);
  if (source.origin !== location.origin) throw new LocalizedError(msg('unexpectedStarterCatalogOrigin'));
  const url = new URL(location.origin);
  url.pathname = import.meta.env.BASE_URL + source.pathname.slice(1);
  url.search = source.search;
  return { manifest: await loadRelease(url, reference), url };
}

export async function upgradeStarterCatalog(current: FrozenRelease): Promise<FrozenRelease | undefined> {
  if (current.localizedLabelsVersion || !navigator.onLine) return;
  const isLocalizedCopy = (candidate?: FrozenRelease): candidate is FrozenRelease =>
    candidate?.localizedLabelsVersion === 1 && candidate.sdeReleaseId === current.sdeReleaseId &&
    candidate.sdeBuildNumber === current.sdeBuildNumber && candidate.provenance.datasetSha256 === current.provenance.datasetSha256;
  async function installedCopy(id?: string) {
    const manifest = id && await installedRelease(id);
    if (manifest && isLocalizedCopy(manifest)) {
      await verifyInstalledFiles(manifest);
      return manifest;
    }
  }

  const active = await getActivePointer();
  if (!active) return;
  if (active.compatibilityId !== current.compatibilityId) return installedCopy(active.compatibilityId);
  const { manifest, url } = await readStarterRelease();
  if (!isLocalizedCopy(manifest)) return;
  const files = await downloadCatalog(manifest, url);
  try {
    await activateCatalog(manifest, files, active.localRevision);
  } catch (error) {
    const winner = await installedCopy((await getActivePointer())?.compatibilityId);
    if (winner) return winner;
    throw error;
  }
  return manifest;
}

export async function openCatalog(): Promise<FrozenRelease> {
  const pointer = await getActivePointer();
  if (pointer) {
    for (const id of [pointer.compatibilityId, pointer.previousId]) {
      if (!id) continue;
      try {
        const current = await installedRelease(id);
        if (current) {
          await verifyInstalledFiles(current);
          return current;
        }
      } catch {
        // Continue to the retained release or the catalog bundled with this build.
      }
    }
  }

  const { manifest, url } = await readStarterRelease();
  const artifacts = await downloadCatalog(manifest, url);
  try {
    await activateCatalog(manifest, artifacts, pointer?.localRevision ?? 0);
  } catch (error) {
    const active = await getActivePointer();
    if (active?.localRevision !== pointer?.localRevision && active) {
      const winning = await installedRelease(active.compatibilityId);
      if (winning) {
        await verifyInstalledFiles(winning);
        return winning;
      }
    }
    throw error;
  }
  return manifest;
}
