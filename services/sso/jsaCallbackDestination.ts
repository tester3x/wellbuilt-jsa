import type { CallbackOwnerResult } from './jsaCallbackOwner';

/** App access never manufactures a JSA request or completion. */
export function callbackMayOpenApp(result: CallbackOwnerResult, hasLaunch: boolean, usableSession: boolean): boolean {
  return (result.kind === 'exchanged' || result.kind === 'duplicate')
    && result.purpose === 'app_access' && !hasLaunch && usableSession;
}
