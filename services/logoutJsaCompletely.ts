import { clearDriverSession } from './driverAuth';
import { clearCanonicalIdentityState } from './sso/jsaCanonicalProfile';
import { signOutGovernedAuth } from './sso/jsaGovernedAuthLive';
import { clearLocalGovernedLaunchState } from './sso/jsaRuntime';
import { runCompleteJsaLogout } from './sso/jsaLogoutContract';

let inFlight: Promise<void> | null = null;

export function logoutJsaCompletely(resetAuthContext?: () => void | Promise<void>): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runCompleteJsaLogout({
    signOutGovernedAuth,
    clearLegacyDriverSession: clearDriverSession,
    clearGovernedState: clearLocalGovernedLaunchState,
    clearCanonicalIdentityState,
    resetAuthContext: async () => { await resetAuthContext?.(); },
  }).finally(() => { inFlight = null; });
  return inFlight;
}
