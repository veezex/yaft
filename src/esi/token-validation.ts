import { LocalizedError, msg } from '../i18n/index.ts';
import { isRecord } from '../storage/catalog-contract.ts';

export const issuer = 'https://login.eveonline.com';
export interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}
export interface Identity {
  characterId: number;
  name: string;
  scopes: string[];
  expiresAt: number;
}

const discoveryURL = `${issuer}/.well-known/oauth-authorization-server`;
let discovery: { until: number; pending: Promise<Discovery> } | undefined;
let signingKeys: { url: string; until: number; pending: Promise<unknown[]> } | undefined;

export function safeEndpoint(value: unknown): string {
  if (typeof value !== 'string') throw new LocalizedError(msg('invalidEveSsoEndpoint'));
  const url = new URL(value);
  if (url.origin !== issuer || url.username || url.password || url.hash || url.search) throw new LocalizedError(msg('invalidEveSsoEndpoint'));
  return url.href;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new LocalizedError(msg('eveSignInHttpUnavailable', response.status));
  return response.json();
}

export function loadDiscovery(): Promise<Discovery> {
  if (discovery && discovery.until > Date.now()) return discovery.pending;
  const pending = getJson(discoveryURL).then(doc => {
    if (!isRecord(doc) || doc.issuer !== issuer || !Array.isArray(doc.code_challenge_methods_supported) ||
        !doc.code_challenge_methods_supported.includes('S256')) throw new LocalizedError(msg('unexpectedEveSsoDiscoveryDocument'));
    return {
      authorization_endpoint: safeEndpoint(doc.authorization_endpoint),
      token_endpoint: safeEndpoint(doc.token_endpoint),
      jwks_uri: safeEndpoint(doc.jwks_uri),
    };
  }).catch(error => { discovery = undefined; throw error; });
  discovery = { until: Date.now() + 15 * 60_000, pending };
  return pending;
}

function keys(url: string, reload = false): Promise<unknown[]> {
  if (!reload && signingKeys?.url === url && signingKeys.until > Date.now()) return signingKeys.pending;
  const pending = getJson(safeEndpoint(url)).then(body => {
    if (!isRecord(body) || !Array.isArray(body.keys)) throw new LocalizedError(msg('eveSsoSigningKeysAre'));
    return body.keys;
  }).catch(error => { signingKeys = undefined; throw error; });
  signingKeys = { url, until: Date.now() + 10 * 60_000, pending };
  return pending;
}

export function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('/', '_').replaceAll('+', '-').replace(/=+$/, '');
}

function unbase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new LocalizedError(msg('invalidEveAccessTokenEncoding'));
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

export async function validateToken(token: string, clientId: string, jwksUrl: string): Promise<Identity> {
  if (token.length > 32_768) throw new LocalizedError(msg('invalidEveAccessTokenSize'));
  const parts = token.split('.');
  if (parts.length !== 3) throw new LocalizedError(msg('invalidEveAccessTokenFormat'));
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const decode = (segment: string): unknown => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unbase64(segment)));
  const header = decode(encodedHeader);
  if (!isRecord(header) || !['RS256', 'ES256'].includes(String(header.alg)) || typeof header.kid !== 'string' || header.crit) {
    throw new LocalizedError(msg('unsupportedEveSigningAlgorithmOr'));
  }
  const elliptic = header.alg === 'ES256';
  const selectKey = (list: unknown[]) => list.find(key => isRecord(key) && key.kid === header.kid &&
    (key.alg === header.alg || key.alg === undefined) && (key.use === 'sig' || key.use === undefined) &&
    key.kty === (elliptic ? 'EC' : 'RSA'));
  const jwk = selectKey(await keys(jwksUrl)) ?? selectKey(await keys(jwksUrl, true));
  if (!jwk) throw new LocalizedError(msg('eveSsoTokenSigningKey'));
  const algorithm = elliptic ? { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' } :
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const publicKey = await crypto.subtle.importKey('jwk', jwk as JsonWebKey, algorithm, false, ['verify']);
  const verified = await crypto.subtle.verify(algorithm, publicKey, unbase64(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`));
  if (!verified) throw new LocalizedError(msg('eveAccessTokenSignatureVerification'));

  const claims = decode(encodedPayload);
  if (!isRecord(claims) || (claims.iss !== issuer && claims.iss !== 'login.eveonline.com') ||
      !Array.isArray(claims.aud) || !claims.aud.includes(clientId) || !claims.aud.includes('EVE Online') ||
      !Number.isSafeInteger(claims.exp) || Number(claims.exp) * 1000 <= Date.now() ||
      (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || Number(claims.nbf) * 1000 > Date.now())) ||
      typeof claims.sub !== 'string' || typeof claims.name !== 'string' || !claims.name.trim()) throw new LocalizedError(msg('invalidEveAccessTokenClaims'));
  const match = /^CHARACTER:EVE:([1-9]\d*)$/.exec(claims.sub);
  const characterId = Number(match?.[1]);
  if (!Number.isSafeInteger(characterId)) throw new LocalizedError(msg('invalidEveCharacterId'));
  const scopes = typeof claims.scp === 'string' ? claims.scp.split(/\s+/).filter(Boolean) : claims.scp;
  if (scopes !== undefined && (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string'))) {
    throw new LocalizedError(msg('invalidEveAccessTokenScopes'));
  }
  return { characterId, name: claims.name, scopes: (scopes ?? []) as string[], expiresAt: Number(claims.exp) * 1000 };
}
