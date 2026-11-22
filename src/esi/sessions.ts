import { LocalizedError, msg } from '../i18n/index.ts';
import { refreshAuthorization, TokenExchangeError } from './sso.ts';
import type { IssuedToken } from './sso.ts';
import type { Identity } from './token-validation.ts';

const prefix = 'yaft.eve.refresh.1:';
const access = new Map<number, { token: string; identity: Identity }>();
const refreshes = new Map<number, Promise<{ token: string; identity: Identity }>>();
const versions = new Map<number, number>();

export function storeSession(result: IssuedToken): Identity {
  const id = result.identity.characterId;
  sessionStorage.setItem(`${prefix}${id}`, result.refreshToken);
  access.set(id, { token: result.accessToken, identity: result.identity });
  return result.identity;
}

export function forgetSession(characterId: number): void {
  versions.set(characterId, (versions.get(characterId) ?? 0) + 1);
  access.delete(characterId);
  refreshes.delete(characterId);
  sessionStorage.removeItem(`${prefix}${characterId}`);
}

export function getAccess(characterId: number, renew = false): Promise<{ token: string; identity: Identity }> {
  const existing = access.get(characterId);
  if (!renew && existing && existing.identity.expiresAt > Date.now() + 45_000) return Promise.resolve(existing);
  const running = refreshes.get(characterId);
  if (running) return running;
  const token = sessionStorage.getItem(`${prefix}${characterId}`);
  if (!token) return Promise.reject(new LocalizedError(msg('connectThisCharacterAgainTo')));
  const version = versions.get(characterId);
  const request = refreshAuthorization(token).then(result => {
    if (versions.get(characterId) !== version) throw new LocalizedError(msg('characterSessionWasDisconnected'));
    if (result.identity.characterId !== characterId) throw new LocalizedError(msg('eveRefreshedADifferentCharacter'));
    storeSession(result);
    return access.get(characterId)!;
  }).catch(error => {
    if (versions.get(characterId) === version && error instanceof TokenExchangeError && error.invalidGrant) forgetSession(characterId);
    throw error;
  }).finally(() => {
    if (refreshes.get(characterId) === request) refreshes.delete(characterId);
  });
  refreshes.set(characterId, request);
  return request;
}

export function tabCharacters(): number[] {
  return Object.keys(sessionStorage).filter(key => key.startsWith(prefix)).map(key => Number(key.slice(prefix.length)))
    .filter(id => Number.isSafeInteger(id) && id > 0);
}
