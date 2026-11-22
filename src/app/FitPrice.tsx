import { useLocale } from '../i18n/LocaleProvider.tsx';
import { errorText, localizedName, msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { useEffect, useRef, useState } from 'react';
import type { Fit } from '../domain/fit.ts';
import type { CatalogType } from '../storage/catalog-contract.ts';
import { estimateFitPrice, getMarketPrices } from '../esi/prices.ts';

export function FitPrice({ fit, known }: { fit: Fit; known: Record<number, CatalogType> }) {
  const { m, locale, text } = useLocale();
  const [market, setMarket] = useState<Awaited<ReturnType<typeof getMarketPrices>>>();
  const [status, setStatus] = useState<Text>('');
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => controller.current?.abort(), []);
  const price = market && estimateFitPrice(fit, market);
  return <details className="fit-price">
    <summary>{m.marketEstimate}</summary>
    <button onClick={() => {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      if (!navigator.onLine) { setStatus(msg('marketPricesRequireAConnection')); return; }
      setStatus(msg('loadingMarketPrices'));
      getMarketPrices(request.signal).then(data => {
        if (request.signal.aborted) return;
        setMarket(data); setStatus('');
      }).catch(reason => {
        if (!request.signal.aborted) setStatus(reason instanceof Error ? errorText(reason) : msg('marketPricesAreUnavailable'));
      });
    }}>{market ? m.refreshEstimate : m.getMarketEstimate}</button>
    {status && <p className="muted">{text(status)}</p>}
    {price && <>
      <p><strong>{m.iskAmount(price.total.toLocaleString(locale, { maximumFractionDigits: 0 }))}</strong>
        {price.missing.length || price.unresolved.length ? m.incompleteEstimate : ''}</p>
      <small>{m.pricesLoaded(new Date(price.loadedAt).toLocaleString(locale))}</small>
      {price.missing.length + price.unresolved.length > 0 && <ul className="transfer-losses" aria-label={m.unpricedItems}>
        {price.missing.map(item => <li key={item.typeId}>{localizedName(locale, known[item.typeId]?.names) ?? `#${item.typeId}`} ×{item.quantity}</li>)}
        {price.unresolved.map((name, index) => <li key={index}>{text(name)}</li>)}
      </ul>}
    </>}
  </details>;
}
