import { msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { checkShell, registerShell } from './register.ts';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function useOfflineState() {
  const [online, setOnline] = useState(navigator.onLine);
  const [shellReady, setShellReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallEvent>();
  const [installed, setInstalled] = useState(() => matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const [persistent, setPersistent] = useState<boolean>();
  const [waiting, setWaiting] = useState(false);
  const [storageMessage, setStorageMessage] = useState<Text>('');

  useEffect(() => {
    let mounted = true;
    const connectivity = () => setOnline(navigator.onLine);
    const installedApp = () => { setInstalled(true); setInstallPrompt(undefined); };
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallEvent); };
    const check = () => void checkShell().then(ready => { if (mounted) setShellReady(ready); });
    const serviceWorker = navigator.serviceWorker;
    window.addEventListener('online', connectivity);
    window.addEventListener('offline', connectivity);
    window.addEventListener('appinstalled', installedApp);
    window.addEventListener('beforeinstallprompt', handleInstall);
    serviceWorker?.addEventListener('controllerchange', check);
    void navigator.storage?.persisted?.().then(value => { if (mounted) setPersistent(value); }).catch(() => {});
    void registerShell().then(registration => {
      if (!mounted || !registration) return;
      check();
      setWaiting(Boolean(registration.waiting));
      registration.addEventListener('updatefound', () => {
        registration.installing?.addEventListener('statechange', () => {
          if (mounted) setWaiting(Boolean(registration.waiting));
        });
      });
    }).catch(() => { if (mounted) setShellReady(false); });
    return () => {
      mounted = false;
      window.removeEventListener('online', connectivity);
      window.removeEventListener('offline', connectivity);
      window.removeEventListener('appinstalled', installedApp);
      window.removeEventListener('beforeinstallprompt', handleInstall);
      serviceWorker?.removeEventListener('controllerchange', check);
    };
  }, []);

  return { online, shellReady, installed, persistent, waiting, storageMessage,
    canInstall: Boolean(installPrompt), canPersist: typeof navigator.storage?.persist === 'function',
    async install() {
      if (!installPrompt) return;
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') setInstalled(true);
      setInstallPrompt(undefined);
    },
    async protectStorage() {
      try {
        const allowed = await navigator.storage.persist();
        setPersistent(allowed);
        setStorageMessage(allowed ? msg('persistentStorageGranted') : msg('theBrowserDeclinedPersistentStorage'));
      } catch {
        setStorageMessage(msg('storageProtectionIsUnavailableKeep'));
      }
    },
  };
}
