import * as SecureStore from 'expo-secure-store';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { awaitGovernedAuthReady, getGovernedAuth, currentGovernedIdentityEpoch } from './jsaGovernedAuthLive';
import { createSharedVerifiedLookup } from './sharedVerifiedLookup';
import { loadGovernedSession } from './jsaRuntime';
import { parseBoundLogoutBaseline, serializeBoundLogoutBaseline } from './jsaLogoutWatcherContract';
import type { ManualInstallationOwner } from './jsaManualLogin';
import { parseCanonicalProfile, type JsaCanonicalProfile } from './jsaIdentityContract';

export const CANONICAL_LOGOUT_BASELINE_KEY = 'jsa_lastCanonicalLogoutAt';

export type { JsaCanonicalProfile } from './jsaIdentityContract';

let profileRevision = 0;
let profileLookup: { key: string; read: () => Promise<JsaCanonicalProfile> } | undefined;
function profileGeneration() {
  return `${currentGovernedIdentityEpoch()}/${getGovernedAuth().currentUser?.uid ?? ''}/${profileRevision}`;
}

export async function fetchCanonicalGovernedProfile(): Promise<JsaCanonicalProfile | null> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const session = await loadGovernedSession();
  if (!session || !auth.currentUser || auth.currentUser.uid !== session.uid) return null;
  const key = JSON.stringify([session.uid, session.driverId, session.companyId, session.generation]);
  if (profileLookup?.key !== key) {
    profileLookup = { key, read: createSharedVerifiedLookup({
      generation: profileGeneration,
      maxAgeMs: 30_000,
      load: async () => {
        const callable = httpsCallable(getFunctions(getApp()), 'getOwnDriverHydration', { timeout: 15_000 });
        const result = await callable({});
        const current = await loadGovernedSession();
        if (!current || JSON.stringify([current.uid, current.driverId, current.companyId, current.generation]) !== key) {
          throw new Error('governed_identity_changed');
        }
        const profile = parseCanonicalProfile(result.data, { driverId: session.driverId, companyId: session.companyId });
        if (!profile) throw new Error('canonical_profile_invalid');
        return profile;
      },
    }) };
  }
  return profileLookup.read();
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
  profileRevision++;
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const session = await loadGovernedSession();
  if (!session || auth.currentUser?.uid !== session.uid) throw new Error('governed_auth_required');
  const callable = httpsCallable(getFunctions(getApp()), 'updateDriverProfile', { timeout: 15_000 });
  try { await callable({ profile }); } finally { profileRevision++; }
}

export async function clearCanonicalIdentityState(): Promise<void> {
  profileRevision++;
  await SecureStore.deleteItemAsync(CANONICAL_LOGOUT_BASELINE_KEY);
}

export async function canonicalBaselineOwnedBy(owner: ManualInstallationOwner): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(CANONICAL_LOGOUT_BASELINE_KEY);
  const baseline = parseBoundLogoutBaseline(raw, owner);
  return !!baseline && baseline.generation === owner.generation;
}

/** Delete only the baseline bound to the installation being rolled back. */
export async function clearCanonicalIdentityStateIfOwned(owner: ManualInstallationOwner): Promise<boolean> {
  if (!(await canonicalBaselineOwnedBy(owner))) return false;
  await SecureStore.deleteItemAsync(CANONICAL_LOGOUT_BASELINE_KEY);
  return await SecureStore.getItemAsync(CANONICAL_LOGOUT_BASELINE_KEY) === null;
}
