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
import { JSA_LAUNCH_CONTEXT_KEY } from './jsaLaunch';

const ATTEMPT_META_KEY = '@jsa/pkceAttemptMeta';
const VERIFIER_KEY = 'jsa_pkce_verifier';
const SESSION_KEY = 'jsa_governed_session';

export async function saveLaunchContext(req: JsaLaunchRequest): Promise<void> {
  await AsyncStorage.setItem(JSA_LAUNCH_CONTEXT_KEY, JSON.stringify(req));
}

export async function loadLaunchContext(): Promise<JsaLaunchRequest | null> {
  try {
    const raw = await AsyncStorage.getItem(JSA_LAUNCH_CONTEXT_KEY);
    return raw ? JSON.parse(raw) as JsaLaunchRequest : null;
  } catch { return null; }
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
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadGovernedSession(): Promise<JsaGovernedSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? JSON.parse(raw) as JsaGovernedSession : null;
  } catch { return null; }
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
