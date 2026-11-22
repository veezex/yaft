import { LocalizedError, msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import type { Fit } from '../domain/fit.ts';
import { isTypeId } from '../domain/fit.ts';
import { isRecord } from '../storage/catalog-contract.ts';
import contract from './contract.snapshot.json';

interface MarketPrices {
  known: Map<number, number>;
  loadedAt: string;
}
let cached: (MarketPrices & { expires: number; etag?: string }) | undefined;

export async function getMarketPrices(signal: AbortSignal): Promise<MarketPrices> {
  if (cached && cached.expires > Date.now()) return cached;
  const headers = new Headers({ Accept: 'application/json', 'X-Compatibility-Date': contract.date });
  if (cached?.etag) headers.set('If-None-Match', cached.etag);
  const response = await fetch(new URL(contract.operations.prices.path, 'https://esi.evetech.net'), {
    cache: 'no-store', credentials: 'omit', redirect: 'error', headers,
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  const maxAge = /(?:^|[, ])max-age=(\d+)/i.exec(response.headers.get('cache-control') ?? '');
  const expires = Date.now() + Math.min(3600, Number(maxAge?.[1] ?? 300)) * 1000;
  if (response.status === 304 && cached) {
    cached = { ...cached, expires };
    return cached;
  }
  if (!response.ok) throw new LocalizedError(msg('marketPricesHttpUnavailable', response.status));
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new LocalizedError(msg('unexpectedEveMarketPriceData'));
  const known = new Map<number, number>();
  for (const row of body) {
    if (!isRecord(row) || !isTypeId(row.type_id)) throw new LocalizedError(msg('invalidMarketPriceType'));
    if (typeof row.average_price === 'number' && Number.isFinite(row.average_price) && row.average_price >= 0) {
      known.set(row.type_id, row.average_price);
    }
  }
  const loadedAt = new Date().toISOString();
  cached = { known, loadedAt, expires, etag: response.headers.get('etag') ?? undefined };
  return cached;
}

export function estimateFitPrice(fit: Fit, market: MarketPrices) {
  const quantities = new Map<number, number>();
  const unresolved: Text[] = [];
  function add(id: number | undefined, amount: number, label?: string) {
    if (id === undefined) unresolved.push(label ?? msg('unknownItem'));
    else quantities.set(id, (quantities.get(id) ?? 0) + amount);
  }
  add(fit.shipTypeId, 1);
  for (const item of fit.items) {
    add(item.typeId, item.quantity, item.unknownSource);
    if (item.charge) add(item.charge.typeId, 1, item.charge.unknownSource);
  }
  let total = 0;
  const missing: { typeId: number; quantity: number }[] = [];
  for (const [typeId, quantity] of quantities) {
    const price = market.known.get(typeId);
    if (price === undefined) missing.push({ typeId, quantity });
    else total += price * quantity;
  }
  return { total, missing, unresolved, loadedAt: market.loadedAt };
}
