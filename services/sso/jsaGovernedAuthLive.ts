/**
 * Live Firebase Auth for governed JSA.
 *
 * Persistence:
 *   initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
 *   on the same Firebase app/project already used by Functions
 *   (`wellbuilt-sync` via services/firebase.ts). AsyncStorage is the
 *   existing storage stack. No new package.
 *
 *   The Auth SDK stores its own user record (so currentUser can restore
 *   across process death). Application code never reads, copies, logs, or
 *   persists customToken, ID token, refresh token, authorization code, or
 *   verifier. SecureStore holds only the sanitized JsaGovernedSession.
 *
 * Readiness:
 *   The first onAuthStateChanged is Auth restoration. Usability decisions
 *   await that signal so a transient pre-hydration null is not need_auth.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signOut,
  type Auth,
} from 'firebase/auth';
import type { Persistence } from 'firebase/auth';
import { app } from '../firebase';
import {
  attachRetryGenerationForCurrentOwner,
  beginUnauthenticatedRecovery,
  classifyInitializeAuthError,
  consumeRecoveryLatchForCurrentOwner,
  finalizeGovernedInstallation,
  installGovernedAuthSession,
  newSessionGeneration,
  sessionGenerationOf,
  type RecoveryLatchOutcome,
  type AuthRecoveryLatch,
  type UnauthRecoveryOutcome,
} from './jsaGovernedAuth';
import type { ExchangePayload } from './jsaSession';
import {
  governedLatchMutator,
  loadAttempt,
  loadAuthRecoveryLatch,
  loadGovernedSession,
  mintAttempt,
  saveAuthRecoveryLatch,
  saveGovernedSession,
  publishGovernedSessionReady,
  strictClearGovernedSessionIfGeneration,
  strictLoadAuthRecoveryLatch,
  strictLoadGovernedSession,
} from './jsaRuntime';
import { createGovernedIdentityMutationCoordinator } from './jsaIdentityMutationContract';
import { cleanupOwnedIdentity, type OwnedCleanupResult } from './jsaOwnedIdentityCleanup';
import type { ManualInstallationOwner } from './jsaManualLogin';
import { runSerializedUnauthenticatedRecovery } from './jsaSerializedRecovery';
import { runStrictRecoverySessionCleanup } from './jsaStrictRecoveryCleanup';

type RnAuthModule = {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
};

let authSingleton: Auth | null = null;
let readyPromise: Promise<void> | null = null;
const identityMutations = createGovernedIdentityMutationCoordinator();

/** One process-wide lane for manual login, Suite SSO, recovery and logout. */
export function runGovernedIdentityMutation<T>(operation: () => Promise<T>): Promise<T> {
  return identityMutations.run(operation);
}

export function reserveGovernedIdentityEpoch(): number { return identityMutations.reserve(); }
export function governedIdentityEpochIsCurrent(epoch: number): boolean { return identityMutations.isCurrent(epoch); }

function reactNativePersistence(): Persistence {
  // RN export — not on the browser typings of firebase/auth.
  const mod = require('firebase/auth') as RnAuthModule;
  if (typeof mod.getReactNativePersistence !== 'function') {
    throw new Error('rn_auth_persistence_unavailable');
  }
  return mod.getReactNativePersistence(AsyncStorage);
}

export function getGovernedAuth(): Auth {
  if (authSingleton) return authSingleton;
  void app;
  const firebaseApp = getApp();
  try {
    authSingleton = initializeAuth(firebaseApp, {
      persistence: reactNativePersistence(),
    });
  } catch (err) {
    if (classifyInitializeAuthError(err) === 'already_initialized') {
      authSingleton = getAuth(firebaseApp);
    } else {
      throw err;
    }
  }
  return authSingleton;
}

export async function signOutGovernedAuthWithinMutation(): Promise<boolean> {
  const auth = getGovernedAuth();
  await awaitGovernedAuthReady();
  let settled = false;
  let resolveSettled!: () => void;
  const settlement = new Promise<void>((resolve) => { resolveSettled = resolve; });
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (user === null) { settled = true; resolveSettled(); }
  });
  try {
    await signOut(auth);
    await Promise.race([
      settlement,
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
    return settled && auth.currentUser === null;
  } finally {
    unsubscribe();
  }
}

export function signOutGovernedAuth(): Promise<boolean> {
  reserveGovernedIdentityEpoch();
  return runGovernedIdentityMutation(signOutGovernedAuthWithinMutation);
}

export function awaitGovernedAuthReady(): Promise<void> {
  if (readyPromise) return readyPromise;
  readyPromise = new Promise((resolve) => {
    const unsub = onAuthStateChanged(getGovernedAuth(), () => {
      unsub();
      resolve();
    });
  });
  return readyPromise;
}

export function currentGovernedAuthUid(): string | null {
  return getGovernedAuth().currentUser?.uid ?? null;
}

export async function loadUsableGovernedSession() {
  await awaitGovernedAuthReady();
  const session = await loadGovernedSession();
  const uid = currentGovernedAuthUid();
  if (!session || !uid || session.uid !== uid) return null;
  return session;
}

async function reconcileGovernedAuthWithinMutation(): Promise<void> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  if (auth.currentUser) {
    await signOut(auth);
  }
}

async function generationEntropyHex(): Promise<string> {
  const Crypto = await import('expo-crypto');
  const bytes = await Crypto.getRandomBytesAsync(8);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export async function persistAfterExchange(
  payload: ExchangePayload,
  options: { stillCurrent?: () => boolean; identityEpoch?: number } = {},
) {
  const epoch = options.identityEpoch ?? reserveGovernedIdentityEpoch();
  const current = () => governedIdentityEpochIsCurrent(epoch)
    && (!options.stillCurrent || options.stillCurrent());
  return runGovernedIdentityMutation(async () => {
    if (!current()) throw new Error('superseded');
    const generation = newSessionGeneration(Date.now(), await generationEntropyHex());
    const result = await installGovernedAuthSession({
      payload,
      legalName: payload.legalName ?? null,
      generation,
      signInWithCustomToken: async (customToken) => {
        const cred = await signInWithCustomToken(getGovernedAuth(), customToken);
        await awaitGovernedAuthReady();
        const uid = cred.user?.uid ?? currentGovernedAuthUid();
        return uid ? { uid } : null;
      },
      persist: async (session) => {
        await saveGovernedSession(session);
        const { seedCanonicalLogoutBaseline } = await import('./jsaCanonicalProfile');
        await seedCanonicalLogoutBaseline();
        if (!current()) throw new Error('superseded');
      },
      reconcileAuth: async () => {
        const installed = await loadGovernedSession();
        if (installed?.generation !== generation) await reconcileGovernedAuthWithinMutation();
      },
      clearIfGeneration: async (gen) => {
        const cleaned = await cleanupOwnedInstallationWithinMutation({
          generation: gen, uid: payload.uid, driverId: payload.driverId, companyId: payload.companyId,
        });
        if (!cleaned.ok && cleaned.failure !== 'session_mismatch') {
          throw new Error(`owned_cleanup_${cleaned.failure}`);
        }
      },
      stillCurrent: current,
    });
    if (!result.ok) throw new Error(result.reason);
    const finalized = await finalizeGovernedInstallation({
      stillCurrent: current,
      attachRecovery: () => attachRetryGenerationForCurrentOwner({
        stillCurrent: current,
        loadAttempt,
        loadLatch: strictLoadAuthRecoveryLatch,
        generation,
        attach: (expected, retryGeneration, ownerCurrent) =>
          governedLatchMutator().attachRetryGeneration(expected, retryGeneration, ownerCurrent),
      }),
      verifyExactIdentity: async () => {
        const installed = await strictLoadGovernedSession();
        return installed?.generation === generation
          && installed.uid === payload.uid
          && installed.driverId === payload.driverId
          && installed.companyId === payload.companyId
          && currentGovernedAuthUid() === payload.uid;
      },
      publishReady: publishGovernedSessionReady,
    });
    if (finalized !== 'not_applicable' && finalized !== 'applied') {
      throw new Error(`post_install_${finalized}`);
    }
    return result.session;
  });
}

/** Caller must already own the serialized mutation lane. */
export async function cleanupOwnedInstallationWithinMutation(
  owner: ManualInstallationOwner,
): Promise<OwnedCleanupResult> {
  const { canonicalBaselineOwnedBy, clearCanonicalIdentityStateIfOwned } = await import('./jsaCanonicalProfile');
  return cleanupOwnedIdentity(owner, {
    loadSession: () => strictLoadGovernedSession(),
    currentFirebaseUid: () => currentGovernedAuthUid(),
    baselineOwned: canonicalBaselineOwnedBy,
    signOutFirebase: signOutGovernedAuthWithinMutation,
    clearSessionGeneration: async (generation) => {
      if (!(await strictClearGovernedSessionIfGeneration(generation))) {
        throw new Error('strict_session_clear_refused');
      }
    },
    clearBaselineIfOwned: clearCanonicalIdentityStateIfOwned,
  });
}

export function reconcileGovernedAuth(): Promise<void> {
  reserveGovernedIdentityEpoch();
  return runGovernedIdentityMutation(reconcileGovernedAuthWithinMutation);
}
export async function liveConsumeRecoveryLatch(session: unknown): Promise<RecoveryLatchOutcome> {
  const epoch = reserveGovernedIdentityEpoch();
  const expectedGeneration = sessionGenerationOf(session);
  const expected = session && typeof session === 'object' ? session as Partial<ExchangePayload> & { generation?: string } : null;
  return runGovernedIdentityMutation(async () => {
    const current = () => governedIdentityEpochIsCurrent(epoch);
    if (!current() || !expectedGeneration) return 'owner_superseded' as RecoveryLatchOutcome;
    const installed = await strictLoadGovernedSession();
    if (!current() || installed?.generation !== expectedGeneration
      || installed.uid !== expected?.uid
      || installed.driverId !== expected?.driverId
      || installed.companyId !== expected?.companyId
      || currentGovernedAuthUid() !== installed.uid) return 'owner_superseded' as RecoveryLatchOutcome;
    return consumeRecoveryLatchForCurrentOwner({
      stillCurrent: current,
      loadAttempt,
      loadLatch: strictLoadAuthRecoveryLatch,
      sessionGeneration: expectedGeneration,
      nowMs: () => Date.now(),
      consume: (input, ownerCurrent) => governedLatchMutator().consumeIfMatching(input, ownerCurrent),
    });
  }).then((outcome) => outcome ?? 'owner_superseded')
    .catch(() => 'storage_failure');
}

export async function liveBeginUnauthenticatedRecovery(
  session: unknown,
): Promise<UnauthRecoveryOutcome> {
  return runSerializedUnauthenticatedRecovery(identityMutations, async (current, epoch) => {
    const outcome = await beginUnauthenticatedRecovery({
      nowMs: () => Date.now(),
      loadLatch: () => loadAuthRecoveryLatch(),
      saveLatch: async (latch: AuthRecoveryLatch) => {
        if (!current()) throw new Error('superseded');
        await saveAuthRecoveryLatch(latch, current);
      },
      loadAttempt: () => loadAttempt(),
      mintAttempt: async () => {
        const Crypto = await import('expo-crypto');
        const attempt = await mintAttempt({
          randomBytes: (n) => Crypto.getRandomBytesAsync(n),
          sha256Hex: async (s) =>
            Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
          nowMs: () => Date.now(),
          stillCurrent: current,
        });
        return attempt;
      },
      usedGeneration: sessionGenerationOf(session),
      recoveryOwnerKey: sessionGenerationOf(session) ?? `no-session:${epoch}`,
      stillCurrent: current,
      clearIfGeneration: async (generation) => {
        await runStrictRecoverySessionCleanup({
          stillCurrent: current,
          generation,
          strictClear: strictClearGovernedSessionIfGeneration,
          exhaustOwnedLatch: async () => {
          const attempt = await loadAttempt();
          if (attempt && current()) {
            await governedLatchMutator().exhaustIfMatching(
              { state: attempt.state, createdAtMs: attempt.createdAtMs }, Date.now(), current,
            );
          }
          },
        });
      },
      reconcileAuth: async () => {
        if (current()) await reconcileGovernedAuthWithinMutation();
      },
    });
    return outcome;
  });
}
