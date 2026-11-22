import { LocalizedError, msg } from '../i18n/index.ts';
import type { ChannelPointer, FrozenRelease } from './catalog-contract.ts';
import { parseChannelPointer } from './catalog-contract.ts';
import { activateCatalog, downloadCatalog, getActivePointer, installedRelease, loadRelease, verifyInstalledFiles } from './catalog-store.ts';

const channelPath = import.meta.env.BASE_URL + 'updates/';
export const currentChannel = channelPath + 'current.json';

export async function readChannel(): Promise<ChannelPointer | undefined> {
  const response = await fetch(currentChannel, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new LocalizedError(msg('catalogChannelUnavailable', response.status));
  return parseChannelPointer(await response.json());
}

export async function updateCatalog(openId?: string): Promise<{ status: 'unchanged' | 'updated'; manifest?: FrozenRelease }> {
  const [active, channel] = await Promise.all([getActivePointer(), readChannel()]);
  if (!channel || channel.revision <= (active?.channelRevision ?? 0)) {
    if (active && active.compatibilityId !== openId) {
      const installed = await installedRelease(active.compatibilityId);
      if (installed) {
        await verifyInstalledFiles(installed);
        return { status: 'updated', manifest: installed };
      }
    }
    return { status: 'unchanged' };
  }
  const path = `releases/${channel.current.compatibilityId}/manifest.json`;
  const reference = new URL(channel.current.url, new URL('/updates/', location.origin));
  if (reference.origin !== location.origin || reference.pathname !== '/updates/' + path) {
    throw new LocalizedError(msg('unexpectedManifestLocation'));
  }
  const dataRoot = new URL(channelPath, location.origin);
  const url = new URL(path + reference.search, dataRoot);
  const manifest = await loadRelease(url, channel.current);
  const downloaded = await downloadCatalog(manifest, dataRoot);
  const confirmed = await readChannel();
  if (!confirmed || confirmed.revision !== channel.revision ||
      confirmed.current.compatibilityId !== channel.current.compatibilityId || confirmed.current.sha256 !== channel.current.sha256) {
    throw new LocalizedError(msg('catalogChangedWhileDownloadingCheck'));
  }
  try {
    await activateCatalog(manifest, downloaded, active?.localRevision ?? 0, channel.revision);
    return { status: 'updated', manifest };
  } catch (error) {
    const winner = await getActivePointer();
    if (!winner || winner.channelRevision < channel.revision) throw error;
    const installed = await installedRelease(winner.compatibilityId);
    if (!installed) throw error;
    await verifyInstalledFiles(installed);
    return { status: 'updated', manifest: installed };
  }
}
