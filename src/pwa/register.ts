export async function registerShell(): Promise<ServiceWorkerRegistration | undefined> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !isSecureContext) return undefined;
  const scope = import.meta.env.BASE_URL;
  const registration = await navigator.serviceWorker.register(scope + 'sw.js', { scope, updateViaCache: 'none' });
  await registration.update().catch(() => {});
  return registration;
}

export function checkShell(): Promise<boolean> {
  const current = navigator.serviceWorker?.controller;
  if (!current) return Promise.resolve(false);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ready: boolean) => { channel.port1.close(); resolve(ready); };
    const timer = setTimeout(() => finish(false), 5000);
    channel.port1.onmessage = ({ data }: MessageEvent<{ ready?: boolean }>) => {
      clearTimeout(timer);
      finish(data.ready === true);
    };
    const entry = document.querySelector<HTMLScriptElement>(`script[type="module"][src^="${import.meta.env.BASE_URL}assets/"]`);
    current.postMessage({ type: 'YAFT_SHELL_STATUS', entry: entry?.getAttribute('src') }, [channel.port2]);
  });
}
