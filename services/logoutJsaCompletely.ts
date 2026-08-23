import * as SecureStore from 'expo-secure-store';
import { clearDriverSession } from './driverAuth';
import { clearCanonicalIdentityState } from './sso/jsaCanonicalProfile';
import { signOutGovernedAuth } from './sso/jsaGovernedAuthLive';
import { clearLocalGovernedLaunchState } from './sso/jsaRuntime';
import { stopGovernedLogoutWatcher } from './sso/jsaLogoutWatcherLive';
import { runCompleteJsaLogout, type CompleteLogoutResult } from './sso/jsaLogoutContract';

let inFlight: Promise<CompleteLogoutResult> | null = null;
export const LOGOUT_VERIFICATION_FAILED_KEY = 'jsa_logoutVerificationFailed';

export function logoutJsaCompletely(resetAuthContext?: () => void | Promise<void>): Promise<CompleteLogoutResult> {
  if (inFlight) return inFlight;
  inFlight = runCompleteJsaLogout({
    clearFirebaseAuth: signOutGovernedAuth,
    clearLegacyDriverSession: clearDriverSession,
    clearGovernedState: async () => {
      stopGovernedLogoutWatcher();
      await clearLocalGovernedLaunchState();
    },
    clearCanonicalIdentityState,
    resetAuthContext: async () => { await resetAuthContext?.(); },
  }).then(async (result) => {
    if (result.verified) await SecureStore.deleteItemAsync(LOGOUT_VERIFICATION_FAILED_KEY).catch(() => {});
    else await SecureStore.setItemAsync(LOGOUT_VERIFICATION_FAILED_KEY, '1').catch(() => {});
    return result;
  }).finally(() => { inFlight = null; });
  return inFlight;
}

export async function hasPendingLogoutFailure(): Promise<boolean> {
  return (await SecureStore.getItemAsync(LOGOUT_VERIFICATION_FAILED_KEY).catch(() => '1')) === '1';
}
