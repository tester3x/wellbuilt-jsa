import * as SecureStore from 'expo-secure-store';
import { getApp } from 'firebase/app';
import { get, getDatabase, onValue, ref, type Unsubscribe } from 'firebase/database';
import { awaitGovernedAuthReady, getGovernedAuth } from './jsaGovernedAuthLive';
import { loadGovernedSession } from './jsaRuntime';
import {
  logoutSignalAdvanced,
  safeLogoutSignalRead,
  watcherBindingMatches,
  type LogoutWatcherBinding,
} from './jsaLogoutWatcherContract';

const BASELINE_KEY = 'jsa_lastCanonicalLogoutAt';
let activeStop: (() => void) | null = null;

export function stopGovernedLogoutWatcher(): void {
  activeStop?.();
  activeStop = null;
}

async function currentBinding(): Promise<LogoutWatcherBinding | null> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const session = await loadGovernedSession();
  if (!auth.currentUser || !session || auth.currentUser.uid !== session.uid) return null;
  const token = await auth.currentUser.getIdTokenResult();
  if (token.claims.driverId !== session.driverId || token.claims.companyId !== session.companyId) return null;
  return { uid: session.uid, driverId: session.driverId, companyId: session.companyId };
}

async function consume(bound: LogoutWatcherBinding, value: unknown): Promise<boolean> {
  if (!watcherBindingMatches(bound, await currentBinding())) return false;
  const raw = await SecureStore.getItemAsync(BASELINE_KEY);
  const baseline = raw === null ? null : Number(raw);
  if (baseline === null || !Number.isFinite(baseline)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      await SecureStore.setItemAsync(BASELINE_KEY, String(value));
    }
    return false;
  }
  if (!logoutSignalAdvanced(baseline, value)) return false;
  await SecureStore.setItemAsync(BASELINE_KEY, String(value));
  return true;
}

export async function checkGovernedLogoutSignalOnce(): Promise<boolean> {
  return safeLogoutSignalRead(async () => {
    const bound = await currentBinding();
    if (!bound) return false;
    const snapshot = await get(ref(getDatabase(getApp()), `drivers/profiles/${bound.driverId}/logoutAt`));
    return consume(bound, snapshot.val());
  });
}

export async function startGovernedLogoutWatcher(
  onLogoutSignal: () => void | Promise<void>,
  onError?: () => void,
): Promise<() => void> {
  stopGovernedLogoutWatcher();
  const bound = await currentBinding();
  if (!bound) return () => {};
  let stopped = false;
  let handling = false;
  const target = ref(getDatabase(getApp()), `drivers/profiles/${bound.driverId}/logoutAt`);
  const unsubscribe: Unsubscribe = onValue(target, (snapshot) => {
    if (stopped || handling) return;
    handling = true;
    void consume(bound, snapshot.val())
      .then(async (signaled) => { if (!stopped && signaled) await onLogoutSignal(); })
      .catch(() => { if (!stopped) onError?.(); })
      .finally(() => { handling = false; });
  }, () => { if (!stopped) onError?.(); });
  const stop = () => { stopped = true; unsubscribe(); if (activeStop === stop) activeStop = null; };
  activeStop = stop;
  return stop;
}
