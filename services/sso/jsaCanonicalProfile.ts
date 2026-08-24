import * as SecureStore from 'expo-secure-store';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { awaitGovernedAuthReady, getGovernedAuth } from './jsaGovernedAuthLive';
import { loadGovernedSession } from './jsaRuntime';
import { parseBoundLogoutBaseline, serializeBoundLogoutBaseline } from './jsaLogoutWatcherContract';
import type { ManualInstallationOwner } from './jsaManualLogin';
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
  const session = await loadGovernedSession();
  const uid = getGovernedAuth().currentUser?.uid;
  if (!profile || !session || !uid || uid !== session.uid) throw new Error('canonical_baseline_binding_failed');
  await SecureStore.setItemAsync(CANONICAL_LOGOUT_BASELINE_KEY, serializeBoundLogoutBaseline({
    uid, driverId: session.driverId, companyId: session.companyId,
    generation: session.generation, value: profile.logoutAt,
  }));
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

/** Delete only the baseline bound to the installation being rolled back. */
export async function clearCanonicalIdentityStateIfOwned(owner: ManualInstallationOwner): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(CANONICAL_LOGOUT_BASELINE_KEY);
  const baseline = parseBoundLogoutBaseline(raw, owner);
  if (!baseline || baseline.generation !== owner.generation) return false;
  await SecureStore.deleteItemAsync(CANONICAL_LOGOUT_BASELINE_KEY);
  return await SecureStore.getItemAsync(CANONICAL_LOGOUT_BASELINE_KEY) === null;
}
