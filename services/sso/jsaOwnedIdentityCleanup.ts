import type { ManualInstallationOwner } from './jsaManualLogin';
import type { JsaGovernedSession } from './jsaSession';

export type OwnedCleanupFailure =
  | 'session_mismatch' | 'firebase_uid_mismatch' | 'baseline_mismatch'
  | 'firebase_signout_failed' | 'session_delete_failed' | 'baseline_delete_failed';

export interface OwnedIdentityCleanupDeps {
  loadSession(): Promise<JsaGovernedSession | null>;
  currentFirebaseUid(): string | null;
  baselineOwned(owner: ManualInstallationOwner): Promise<boolean>;
  signOutFirebase(): Promise<boolean>;
  clearSessionGeneration(generation: string): Promise<void>;
  clearBaselineIfOwned(owner: ManualInstallationOwner): Promise<boolean>;
}

export type OwnedCleanupResult =
  | { ok: true; mutated: true }
  | { ok: false; mutated: boolean; failure: OwnedCleanupFailure };

/** Complete ownership proof. No mutation is permitted before this succeeds. */
export async function preflightOwnedIdentityCleanup(
  owner: ManualInstallationOwner,
  deps: Pick<OwnedIdentityCleanupDeps, 'loadSession' | 'currentFirebaseUid' | 'baselineOwned'>,
): Promise<OwnedCleanupResult | { ok: true; mutated: false }> {
  const session = await deps.loadSession();
  if (!session || session.generation !== owner.generation || session.uid !== owner.uid
    || session.driverId !== owner.driverId || session.companyId !== owner.companyId) {
    return { ok: false, mutated: false, failure: 'session_mismatch' };
  }
  if (deps.currentFirebaseUid() !== owner.uid) {
    return { ok: false, mutated: false, failure: 'firebase_uid_mismatch' };
  }
  try {
    if (!(await deps.baselineOwned(owner))) {
      return { ok: false, mutated: false, failure: 'baseline_mismatch' };
    }
  } catch {
    return { ok: false, mutated: false, failure: 'baseline_mismatch' };
  }
  return { ok: true, mutated: false };
}

/** Must run inside the single governed identity-mutation lane. */
export async function cleanupOwnedIdentity(
  owner: ManualInstallationOwner,
  deps: OwnedIdentityCleanupDeps,
): Promise<OwnedCleanupResult> {
  const preflight = await preflightOwnedIdentityCleanup(owner, deps);
  if (!preflight.ok) return preflight;
  try {
    if (!(await deps.signOutFirebase())) {
      return { ok: false, mutated: false, failure: 'firebase_signout_failed' };
    }
  } catch {
    return { ok: false, mutated: false, failure: 'firebase_signout_failed' };
  }
  try {
    await deps.clearSessionGeneration(owner.generation);
    const remaining = await deps.loadSession();
    if (remaining?.generation === owner.generation) {
      return { ok: false, mutated: true, failure: 'session_delete_failed' };
    }
  } catch {
    return { ok: false, mutated: true, failure: 'session_delete_failed' };
  }
  try {
    if (!(await deps.clearBaselineIfOwned(owner))) {
      return { ok: false, mutated: true, failure: 'baseline_delete_failed' };
    }
  } catch {
    return { ok: false, mutated: true, failure: 'baseline_delete_failed' };
  }
  return { ok: true, mutated: true };
}
