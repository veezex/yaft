import { LanguageSelect, useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { useEffect, useState } from 'react';
import { completeAuthorization } from '../esi/sso.ts';
import { storeSession } from '../esi/sessions.ts';

export function EveCallback({ authorization }: { authorization: ReturnType<typeof completeAuthorization> }) {
  const { text, m } = useLocale();
  const [message, setMessage] = useState<Text>(msg('connectingToEve'));
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    let current = true;
    authorization.then(token => {
      if (!current) return;
      const identity = storeSession(token);
      setMessage(msg('connectedAs', identity.name));
      setComplete(true);
    }).catch(error => {
      if (!current) return;
      setMessage(error instanceof Error ? errorText(error) : msg('eveSignInFailed'));
      setComplete(true);
    });
    return () => { current = false; };
  }, [authorization]);
  return <main className="workspace callback">
    <h1>{m.eveSignIn}</h1><LanguageSelect /><p role="status">{text(message)}</p>
    {complete && <a href={import.meta.env.BASE_URL}>{m.returnToFittingWorkspace}</a>}
  </main>;
}
