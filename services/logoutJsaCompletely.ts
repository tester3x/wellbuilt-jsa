import * as SecureStore from 'expo-secure-store';
import { signOutGovernedAuth } from './sso/jsaGovernedAuthLive';
import { stopGovernedLogoutWatcher } from './sso/jsaLogoutWatcherLive';
import {
  clearCanonicalBaselineStrictly,
  clearGovernedStateStrictly,
  clearLocalIdentityStrictly,
} from './sso/jsaStrictLogoutStorageLive';
import { runCompleteJsaLogout, type CompleteLogoutResult } from './sso/jsaLogoutContract';

let inFlight: Promise<CompleteLogoutResult> | null = null;
export const LOGOUT_VERIFICATION_FAILED_KEY = 'jsa_logoutVerificationFailed';

export function logoutJsaCompletely(resetAuthContext?: () => void | Promise<void>): Promise<CompleteLogoutResult> {
  if (inFlight) return inFlight;
  let firebaseCleared = false;
  let localCleared = false;
  let governedCleared = false;
  inFlight = runCompleteJsaLogout({
    clearFirebaseAuth: async () => {
      firebaseCleared = await signOutGovernedAuth();
      return firebaseCleared;
    },
    clearLegacyDriverSession: async () => {
      await clearLocalIdentityStrictly();
      localCleared = true;
    },
    clearGovernedState: async () => {
      stopGovernedLogoutWatcher();
      await clearGovernedStateStrictly();
      governedCleared = true;
    },
    clearCanonicalIdentityState: async () => {
      if (!firebaseCleared || !localCleared || !governedCleared) throw new Error('logout_incomplete_baseline_retained');
      await clearCanonicalBaselineStrictly();
    },
    resetAuthContext: async () => { await resetAuthContext?.(); },
  }).then(async (result) => {
    try {
      if (result.verified) {
        await SecureStore.deleteItemAsync(LOGOUT_VERIFICATION_FAILED_KEY);
        if (await SecureStore.getItemAsync(LOGOUT_VERIFICATION_FAILED_KEY) !== null) throw new Error('failure_marker_remaining');
      } else {
        await SecureStore.setItemAsync(LOGOUT_VERIFICATION_FAILED_KEY, '1');
        if (await SecureStore.getItemAsync(LOGOUT_VERIFICATION_FAILED_KEY) !== '1') throw new Error('failure_marker_missing');
      }
    } catch (error) {
      result.localIdentityCleared = false;
      result.verified = false;
      result.failures.push({ operation: 'localIdentity', message: error instanceof Error ? error.message : 'failure_marker_storage_failed' });
    }
    return result;
  }).finally(() => { inFlight = null; });
  return inFlight;
}

export async function hasPendingLogoutFailure(): Promise<boolean> {
  try { return await SecureStore.getItemAsync(LOGOUT_VERIFICATION_FAILED_KEY) === '1'; }
  catch { return true; }
}
