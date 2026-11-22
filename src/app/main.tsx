import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { callbackPath, completeAuthorization } from '../esi/sso.ts';
import { EveCallback } from './EveCallback.tsx';
import { App } from './App.tsx';
import { LocaleProvider } from '../i18n/LocaleProvider.tsx';

let authorization;
if (location.pathname === callbackPath) {
  const incoming = new URLSearchParams(location.search);
  history.replaceState(null, '', callbackPath);
  authorization = completeAuthorization(incoming);
  void authorization.catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocaleProvider>{authorization ? <EveCallback authorization={authorization} /> : <App />}</LocaleProvider>
  </StrictMode>,
);
