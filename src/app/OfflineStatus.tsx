import { useLocale } from '../i18n/LocaleProvider.tsx';
import { useOfflineState } from '../pwa/readiness.ts';

export function OfflineStatus({ catalogReady }: { catalogReady: boolean }) {
  const { m, text } = useLocale();
  const state = useOfflineState();
  return <div className="offline-status">
    <p>{state.online ? state.shellReady && catalogReady ? m.offlineReady : m.preparingOfflineAccess :
      catalogReady ? m.offlineLocalWorkspace : m.offlineOpenOnceOnlineTo}</p>
    {state.installed && <small>{m.installedApp}</small>}
    {state.waiting && <small>{m.appUpdateIsActivatingReopening}</small>}
    <div className="actions">
      {state.canInstall && <button className="subtle" onClick={() => void state.install().catch(() => {})}>{m.installApp}</button>}
      {state.canPersist && state.persistent !== true && <button className="subtle" onClick={() => void state.protectStorage()}>{m.protectBrowserStorage}</button>}
    </div>
    {state.storageMessage && <small>{text(state.storageMessage)}</small>}
    {!state.online && <small>{m.eveSignInAndCatalog}</small>}
  </div>;
}
