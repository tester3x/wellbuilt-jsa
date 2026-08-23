import * as SecureStore from 'expo-secure-store';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { awaitGovernedAuthReady, getGovernedAuth } from './jsaGovernedAuthLive';
import { loadGovernedSession } from './jsaRuntime';
import { parseCanonicalProfile, type JsaCanonicalProfile } from './jsaIdentityContract';

export const CANONICAL_LOGOUT_BASELINE_KEY = 'jsa_lastCanonicalLogoutAt';

export type { JsaCanonicalProfile } from './jsaIdentityContract';

export async function fetchCanonicalGovernedProfile(): Promise<JsaCanonicalProfile | null> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const session = await loadGovernedSession();
  if (!session || !auth.currentUser || auth.currentUser.uid !== session.uid) return null;
  const callable = httpsCallable(getFunctions(getApp()), 'getOwnDriverHydration', { timeout: 15_000 });
  const result = await callable({});
  return parseCanonicalProfile(result.data, { driverId: session.driverId, companyId: session.companyId });
}

export async function seedCanonicalLogoutBaseline(): Promise<void> {
  const profile = await fetchCanonicalGovernedProfile();
  await SecureStore.setItemAsync(CANONICAL_LOGOUT_BASELINE_KEY, String(profile?.logoutAt ?? 0));
}

export async function updateCanonicalGovernedProfile(profile: Record<string, unknown>): Promise<void> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const session = await loadGovernedSession();
  if (!session || auth.currentUser?.uid !== session.uid) throw new Error('governed_auth_required');
  const callable = httpsCallable(getFunctions(getApp()), 'updateDriverProfile', { timeout: 15_000 });
  await callable({ profile });
}

export async function clearCanonicalIdentityState(): Promise<void> {
  await SecureStore.deleteItemAsync(CANONICAL_LOGOUT_BASELINE_KEY);
}
