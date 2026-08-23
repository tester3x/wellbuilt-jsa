/**
 * Durable PKCE attempt + governed session persistence.
 * Verifier lives in SecureStore only. No URI logging.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  encodeB64Url32,
  type JsaPkceAttempt,
} from './jsaPkce';
import type { JsaLaunchRequest } from './jsaLaunch';
import type { JsaGovernedSession } from './jsaSession';
import { sanitizeSessionForPersist, validatePersistedGovernedSession } from './jsaSession';
import {
  createSerializedLatchMutator,
  createSerializedSessionMutator,
  parseAuthRecoveryLatch,
  parseGovernedTerminalFailure,
  type AuthRecoveryLatch,
  type JsaGovernedSessionView,
} from './jsaGovernedAuth';
import { JSA_LAUNCH_CONTEXT_KEY } from './jsaLaunch';
import {
  FRESH_GOVERNED_SUBMITTED_KEY,
  parseFreshSubmittedMarker,
  type FreshSubmittedMarker,
} from './jsaGovernedTerminal';
import type { JsaLaunchOwnership } from './jsaRouteOwnership';
import {
  GOVERNED_LAUNCH_OWNERSHIP_KEY,
  GOVERNED_PENDING_COMPLETE_KEY,
  GOVERNED_REQUEST_CONTEXT_KEY,
  GOVERNED_UI_STAGE_KEY,
  parseGetContextView,
  parsePendingComplete,
  type JsaRequestContextView,
  type PendingCompleteRecord,
} from './jsaRequestLifecycle';

const ATTEMPT_META_KEY = '@jsa/pkceAttemptMeta';
const VERIFIER_KEY = 'jsa_pkce_verifier';
const SESSION_KEY = 'jsa_governed_session';
export const AUTH_RECOVERY_LATCH_KEY = '@jsa/authRecoveryLatch';
export const GOVERNED_TERMINAL_FAILURE_KEY = '@jsa/governedTerminalFailure';

async function loadGovernedSessionUnlocked(): Promise<JsaGovernedSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    return validatePersistedGovernedSession(JSON.parse(raw)) as JsaGovernedSession | null;
  } catch { return null; }
}

const sessionMutator = createSerializedSessionMutator({
  load: () => loadGovernedSessionUnlocked() as Promise<JsaGovernedSessionView | null>,
  save: async (session) => {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
  },
});

export async function saveLaunchContext(req: JsaLaunchRequest): Promise<void> {
  await AsyncStorage.setItem(JSA_LAUNCH_CONTEXT_KEY, JSON.stringify(req));
}

export async function loadLaunchContext(): Promise<JsaLaunchRequest | null> {
  try {
    const raw = await AsyncStorage.getItem(JSA_LAUNCH_CONTEXT_KEY);
    return raw ? JSON.parse(raw) as JsaLaunchRequest : null;
  } catch { return null; }
}

export async function clearLaunchContext(): Promise<void> {
  await AsyncStorage.removeItem(JSA_LAUNCH_CONTEXT_KEY);
}

export async function saveFreshSubmittedMarker(marker: FreshSubmittedMarker): Promise<void> {
  await AsyncStorage.setItem(FRESH_GOVERNED_SUBMITTED_KEY, JSON.stringify(marker));
}

export async function loadFreshSubmittedMarker(): Promise<FreshSubmittedMarker | null> {
  try {
    const raw = await AsyncStorage.getItem(FRESH_GOVERNED_SUBMITTED_KEY);
    return raw ? parseFreshSubmittedMarker(JSON.parse(raw)) : null;
  } catch { return null; }
}

export async function clearFreshSubmittedMarker(): Promise<void> {
  await AsyncStorage.removeItem(FRESH_GOVERNED_SUBMITTED_KEY);
}

export async function recordFreshGovernedSubmitted(
  requestId: string,
  action: string,
  nowMs = Date.now(),
): Promise<void> {
  await saveFreshSubmittedMarker({ requestId, action, submittedAtMs: nowMs });
}

export async function saveAttempt(attempt: JsaPkceAttempt): Promise<void> {
  await SecureStore.setItemAsync(VERIFIER_KEY, attempt.verifier);
  await AsyncStorage.setItem(ATTEMPT_META_KEY, JSON.stringify({
    state: attempt.state,
    challenge: attempt.challenge,
    createdAtMs: attempt.createdAtMs,
    consumed: attempt.consumed,
  }));
}

export async function loadAttempt(): Promise<JsaPkceAttempt | null> {
  try {
    const metaRaw = await AsyncStorage.getItem(ATTEMPT_META_KEY);
    const verifier = await SecureStore.getItemAsync(VERIFIER_KEY);
    if (!metaRaw || !verifier) return null;
    const meta = JSON.parse(metaRaw);
    return { ...meta, verifier };
  } catch { return null; }
}

export async function clearAttempt(): Promise<void> {
  await AsyncStorage.removeItem(ATTEMPT_META_KEY);
  await SecureStore.deleteItemAsync(VERIFIER_KEY).catch(() => {});
}

export async function saveGovernedSession(session: JsaGovernedSession): Promise<void> {
  const sanitized = sanitizeSessionForPersist(session);
  if (!validatePersistedGovernedSession(sanitized)) {
    throw new Error('invalid_session');
  }
  await sessionMutator.save(sanitized);
}

export async function loadGovernedSession(): Promise<JsaGovernedSession | null> {
  return loadGovernedSessionUnlocked();
}

export async function clearGovernedSession(): Promise<void> {
  await sessionMutator.clear();
}

/** Clear only if the stored generation is still the one this call used. Serialized with save. */
export async function clearGovernedSessionIfGeneration(used: string): Promise<boolean> {
  return sessionMutator.clearIfGeneration(used);
}

export async function markGovernedTerminalFailure(requestId: string): Promise<void> {
  if (!requestId) return;
  await AsyncStorage.setItem(GOVERNED_TERMINAL_FAILURE_KEY, JSON.stringify({ requestId }));
}

export async function clearGovernedTerminalFailureFor(requestId: string): Promise<boolean> {
  const current = await loadGovernedTerminalFailure();
  if (!current || current.requestId !== requestId) return false;
  await AsyncStorage.removeItem(GOVERNED_TERMINAL_FAILURE_KEY);
  return true;
}

export async function loadGovernedTerminalFailure(): Promise<{ requestId: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(GOVERNED_TERMINAL_FAILURE_KEY);
    if (!raw) return null;
    if (raw === '1') return null;
    return parseGovernedTerminalFailure(JSON.parse(raw));
  } catch { return null; }
}

async function loadAuthRecoveryLatchUnlocked(): Promise<AuthRecoveryLatch | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_RECOVERY_LATCH_KEY);
    if (!raw) return null;
    return parseAuthRecoveryLatch(JSON.parse(raw));
  } catch { return null; }
}

const latchMutator = createSerializedLatchMutator({
  load: () => loadAuthRecoveryLatchUnlocked(),
  save: async (latch) => {
    await AsyncStorage.setItem(AUTH_RECOVERY_LATCH_KEY, JSON.stringify({
      state: latch.state,
      createdAtMs: latch.createdAtMs,
      usedAtMs: latch.usedAtMs,
      phase: latch.phase,
      failedGeneration: latch.failedGeneration,
      retryGeneration: latch.retryGeneration,
    }));
  },
  clear: async () => {
    await AsyncStorage.removeItem(AUTH_RECOVERY_LATCH_KEY);
  },
});

export async function saveAuthRecoveryLatch(latch: AuthRecoveryLatch): Promise<void> {
  await latchMutator.save(latch);
}

export async function loadAuthRecoveryLatch(): Promise<AuthRecoveryLatch | null> {
  return loadAuthRecoveryLatchUnlocked();
}

export async function clearAuthRecoveryLatch(): Promise<void> {
  await latchMutator.clear();
}

export function governedLatchMutator() {
  return latchMutator;
}

export async function mintAttempt(ops: {
  randomBytes: (n: number) => Promise<Uint8Array>;
  sha256Hex: (s: string) => Promise<string>;
  nowMs: () => number;
}): Promise<JsaPkceAttempt> {
  const stateBytes = await ops.randomBytes(32);
  const verifierBytes = await ops.randomBytes(32);
  const state = encodeB64Url32(stateBytes);
  const verifier = encodeB64Url32(verifierBytes);
  const digest = await ops.sha256Hex(verifier);
  const challengeBytes = new Uint8Array(digest.length / 2);
  for (let i = 0; i < challengeBytes.length; i++) {
    challengeBytes[i] = parseInt(digest.slice(i * 2, i * 2 + 2), 16);
  }
  const challenge = encodeB64Url32(challengeBytes);
  const attempt: JsaPkceAttempt = {
    state, verifier, challenge, createdAtMs: ops.nowMs(), consumed: false,
  };
  await saveAttempt(attempt);
  return attempt;
}

export async function saveLaunchOwnership(own: JsaLaunchOwnership): Promise<void> {
  await AsyncStorage.setItem(GOVERNED_LAUNCH_OWNERSHIP_KEY, JSON.stringify(own));
}

export async function loadLaunchOwnership(): Promise<JsaLaunchOwnership | null> {
  try {
    const raw = await AsyncStorage.getItem(GOVERNED_LAUNCH_OWNERSHIP_KEY);
    return raw ? JSON.parse(raw) as JsaLaunchOwnership : null;
  } catch { return null; }
}

export async function saveRequestContext(view: JsaRequestContextView): Promise<void> {
  await AsyncStorage.setItem(GOVERNED_REQUEST_CONTEXT_KEY, JSON.stringify(view));
}

export async function loadRequestContext(): Promise<JsaRequestContextView | null> {
  try {
    const raw = await AsyncStorage.getItem(GOVERNED_REQUEST_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = parseGetContextView(JSON.parse(raw));
    return parsed.ok ? parsed.value : null;
  } catch { return null; }
}

export async function clearRequestContext(): Promise<void> {
  await AsyncStorage.removeItem(GOVERNED_REQUEST_CONTEXT_KEY);
}

export async function savePendingComplete(rec: PendingCompleteRecord): Promise<void> {
  await AsyncStorage.setItem(GOVERNED_PENDING_COMPLETE_KEY, JSON.stringify(rec));
}

export async function loadPendingComplete(): Promise<PendingCompleteRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(GOVERNED_PENDING_COMPLETE_KEY);
    return raw ? parsePendingComplete(JSON.parse(raw)) : null;
  } catch { return null; }
}

export async function clearPendingComplete(): Promise<void> {
  await AsyncStorage.removeItem(GOVERNED_PENDING_COMPLETE_KEY);
}

export async function saveGovernedUiStage(stage: string): Promise<void> {
  await AsyncStorage.setItem(GOVERNED_UI_STAGE_KEY, stage);
}

export async function loadGovernedUiStage(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(GOVERNED_UI_STAGE_KEY);
  } catch { return null; }
}

export async function clearGovernedUiStage(): Promise<void> {
  await AsyncStorage.removeItem(GOVERNED_UI_STAGE_KEY);
}

/**
 * Leave governed presentation locally without touching Suite or its shift.
 * Artifact queues/local saves are deliberately retained for recovery.
 */
export async function clearLocalGovernedLaunchState(): Promise<void> {
  await Promise.all([
    clearLaunchContext(),
    clearAttempt(),
    clearGovernedSession(),
    clearAuthRecoveryLatch(),
    clearRequestContext(),
    clearPendingComplete(),
    clearGovernedUiStage(),
    clearFreshSubmittedMarker(),
    AsyncStorage.removeItem(GOVERNED_LAUNCH_OWNERSHIP_KEY),
    AsyncStorage.removeItem(GOVERNED_TERMINAL_FAILURE_KEY),
    AsyncStorage.removeItem('jsa_returnTo'),
    AsyncStorage.removeItem('jsa_autofill'),
    AsyncStorage.removeItem('@jsa/wbtReadRequest'),
  ]);
}

/** Stay on JSA / successful Return: drop only transient launch/nav. */
export async function consumeGovernedLaunchAfterStay(): Promise<void> {
  await clearFreshSubmittedMarker();
  await clearLaunchContext();
  await AsyncStorage.removeItem(GOVERNED_LAUNCH_OWNERSHIP_KEY);
  await clearGovernedUiStage();
}

/**
 * Open the governed WB-T return URL, then consume transient nav only if
 * Linking accepted the handoff. A throw leaves marker + launch in place.
 */
export async function handoffGovernedReturnThenConsume(input: {
  launch: JsaLaunchRequest | null;
  action: string;
  reused?: boolean;
  openUrl: (url: string) => Promise<void>;
}): Promise<'opened_and_consumed' | 'open_failed_retain' | 'no_url'> {
  const { decideGovernedReturn } = await import('./jsaReturn');
  const decided = decideGovernedReturn({
    launch: input.launch,
    completion: input.launch
      ? { requestId: input.launch.requestId, action: input.action as never, reused: !!input.reused }
      : null,
  });
  if (!('open' in decided)) return 'no_url';
  try {
    await input.openUrl(decided.open);
  } catch {
    return 'open_failed_retain';
  }
  await consumeGovernedLaunchAfterStay();
  return 'opened_and_consumed';
}
