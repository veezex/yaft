import { LocalizedError, msg } from '../i18n/index.ts';
import type { Text } from '../i18n/index.ts';
import { isRecord } from '../storage/catalog-contract.ts';
import { base64Url, loadDiscovery, validateToken } from './token-validation.ts';
import type { Identity } from './token-validation.ts';

const base = import.meta.env.BASE_URL;
export const callbackPath = base + (base === '/' ? 'auth/eve/callback' : 'auth/eve/callback/');
export const clientId = (import.meta.env.VITE_EVE_CLIENT_ID as string | undefined)?.trim() || '';
const pendingKey = 'yaft.eve.pkce.1';
const exchangeTimeout = 8 * 60_000;

export interface IssuedToken {
  accessToken: string;
  refreshToken: string;
  identity: Identity;
}
interface AuthorizeAttempt {
  state: string;
  verifier: string;
  createdAt: number;
  redirectUri: string;
  scopes: string[];
}

function callbackURL() {
  if (location.protocol !== 'https:') throw new LocalizedError(msg('eveSignInRequiresHttps'));
  return new URL(callbackPath, location.origin).href;
}

export async function authorize(scopes: string[]): Promise<void> {
  if (!clientId) throw new LocalizedError(msg('configureEveClientId'));
  const redirectUri = callbackURL();
  const discovery = await loadDiscovery();
  const state = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const attempt: AuthorizeAttempt = { state, verifier, createdAt: Date.now(), redirectUri, scopes };
  sessionStorage.setItem(pendingKey, JSON.stringify(attempt));
  const target = new URL(discovery.authorization_endpoint);
  target.search = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state,
    scope: [...new Set(scopes)].join(' '), code_challenge: challenge, code_challenge_method: 'S256',
  }).toString();
  location.assign(target.href);
}

export class TokenExchangeError extends LocalizedError {
  readonly invalidGrant: boolean;
  constructor(message: Text, invalidGrant = false) {
    super(message);
    this.invalidGrant = invalidGrant;
  }
}

async function exchange(values: Record<string, string>, priorRefreshToken?: string): Promise<IssuedToken> {
  if (!clientId) throw new LocalizedError(msg('missingEveClientId'));
  const discovery = await loadDiscovery();
  const response = await fetch(discovery.token_endpoint, {
    method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ ...values, client_id: clientId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    const invalid = isRecord(error) && error.error === 'invalid_grant';
    throw new TokenExchangeError(invalid ? msg('authorizationExpired') :
      msg('eveTokenHttpError', response.status), invalid);
  }
  const token = await response.json();
  if (!isRecord(token) || typeof token.access_token !== 'string' || typeof token.token_type !== 'string' ||
      token.token_type.toLowerCase() !== 'bearer') throw new LocalizedError(msg('invalidEveSsoTokenResponse'));
  const refreshToken = token.refresh_token ?? priorRefreshToken;
  if (typeof refreshToken !== 'string' || !refreshToken) throw new LocalizedError(msg('missingEveRefreshToken'));
  return { accessToken: token.access_token, refreshToken, identity: await validateToken(token.access_token, clientId, discovery.jwks_uri) };
}

export async function completeAuthorization(callback: URLSearchParams): Promise<IssuedToken> {
  const stored = sessionStorage.getItem(pendingKey);
  sessionStorage.removeItem(pendingKey);
  if (!stored) throw new LocalizedError(msg('missingEveSignInAttempt'));
  const attempt = JSON.parse(stored) as AuthorizeAttempt;
  const elapsed = Date.now() - attempt.createdAt;
  if (callback.getAll('state').length !== 1 || callback.get('state') !== attempt.state ||
      !Number.isFinite(elapsed) || elapsed < 0 || elapsed > exchangeTimeout || !attempt.verifier ||
      attempt.redirectUri !== callbackURL()) throw new LocalizedError(msg('invalidEveSignInAttempt'));
  if (callback.has('error')) throw new LocalizedError(msg('eveSignInWasDeclined'));
  const code = callback.get('code');
  if (!code || callback.getAll('code').length !== 1) throw new LocalizedError(msg('missingEveAuthorizationCode'));
  const token = await exchange({ grant_type: 'authorization_code', code, redirect_uri: attempt.redirectUri, code_verifier: attempt.verifier });
  if (attempt.scopes.some(scope => !token.identity.scopes.includes(scope))) throw new LocalizedError(msg('missingEvePermissions'));
  return token;
}

export function refreshAuthorization(refreshToken: string) {
  return exchange({ grant_type: 'refresh_token', refresh_token: refreshToken }, refreshToken);
}
