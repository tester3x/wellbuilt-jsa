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
  beginUnauthenticatedRecovery,
  classifyInitializeAuthError,
  installGovernedAuthSession,
  newSessionGeneration,
  sessionGenerationOf,
  type AuthRecoveryLatch,
  type UnauthRecoveryOutcome,
} from './jsaGovernedAuth';
import type { ExchangePayload } from './jsaSession';
import {
  clearGovernedSessionIfGeneration,
  governedLatchMutator,
  loadAttempt,
  loadAuthRecoveryLatch,
  loadGovernedSession,
  mintAttempt,
  saveAuthRecoveryLatch,
  saveGovernedSession,
  publishGovernedSessionReady,
} from './jsaRuntime';
import { createGovernedIdentityMutationCoordinator } from './jsaIdentityMutationContract';

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
        publishGovernedSessionReady();
      },
      reconcileAuth: () => reconcileGovernedAuthWithinMutation(),
      clearIfGeneration: async (gen) => {
        const installed = await loadGovernedSession();
        if (installed?.generation !== gen || installed.uid !== payload.uid
          || installed.driverId !== payload.driverId || installed.companyId !== payload.companyId) return;
        const { clearCanonicalIdentityStateIfOwned } = await import('./jsaCanonicalProfile');
        await clearCanonicalIdentityStateIfOwned({
          generation: gen, uid: payload.uid, driverId: payload.driverId, companyId: payload.companyId,
        });
        await clearGovernedSessionIfGeneration(gen);
      },
      stillCurrent: current,
    });
    if (!result.ok) throw new Error(result.reason);
    const attempt = await loadAttempt();
    if (attempt) {
      await governedLatchMutator().attachRetryGeneration(
        { state: attempt.state, createdAtMs: attempt.createdAtMs },
        generation,
      );
    }
    return result.session;
  });
}

export function reconcileGovernedAuth(): Promise<void> {
  reserveGovernedIdentityEpoch();
  return runGovernedIdentityMutation(reconcileGovernedAuthWithinMutation);
}
export async function liveConsumeRecoveryLatch(session: unknown): Promise<void> {
  const attempt = await loadAttempt();
  await governedLatchMutator().consumeIfMatching({
    nowMs: Date.now(),
    sessionGeneration: sessionGenerationOf(session),
    attemptState: attempt?.state ?? null,
    attemptCreatedAtMs: attempt?.createdAtMs ?? null,
  });
}

export async function liveBeginUnauthenticatedRecovery(
  session: unknown,
): Promise<UnauthRecoveryOutcome> {
  return beginUnauthenticatedRecovery({
    nowMs: () => Date.now(),
    loadLatch: () => loadAuthRecoveryLatch(),
    saveLatch: (latch: AuthRecoveryLatch) => saveAuthRecoveryLatch(latch),
    loadAttempt: () => loadAttempt(),
    mintAttempt: async () => {
      const Crypto = await import('expo-crypto');
      const attempt = await mintAttempt({
        randomBytes: (n) => Crypto.getRandomBytesAsync(n),
        sha256Hex: async (s) =>
          Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
        nowMs: () => Date.now(),
      });
      return attempt;
    },
    usedGeneration: sessionGenerationOf(session),
    currentGeneration: async () => sessionGenerationOf(await loadGovernedSession()),
    clearIfGeneration: async (generation) => {
      await clearGovernedSessionIfGeneration(generation);
    },
    reconcileAuth: () => reconcileGovernedAuth(),
  });
}
