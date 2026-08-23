import * as SecureStore from 'expo-secure-store';
import { getApp } from 'firebase/app';
import { get, getDatabase, onValue, ref, type Unsubscribe } from 'firebase/database';
import { awaitGovernedAuthReady, getGovernedAuth } from './jsaGovernedAuthLive';
import { loadGovernedSession } from './jsaRuntime';
import {
  logoutSignalAdvanced,
  parseBoundLogoutBaseline,
  serializeBoundLogoutBaseline,
  safeLogoutSignalRead,
  createLatestValueDrain,
  createWatcherMountCoordinator,
  watcherBindingMatches,
  type LogoutWatcherBinding,
} from './jsaLogoutWatcherContract';

const BASELINE_KEY = 'jsa_lastCanonicalLogoutAt';
export const governedWatcherCoordinator = createWatcherMountCoordinator<LogoutWatcherBinding>();

export function stopGovernedLogoutWatcher(): void {
  governedWatcherCoordinator.dispose();
}

export async function currentGovernedWatcherBinding(): Promise<LogoutWatcherBinding | null> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const session = await loadGovernedSession();
  if (!auth.currentUser || !session || auth.currentUser.uid !== session.uid) return null;
  const token = await auth.currentUser.getIdTokenResult();
  if (token.claims.driverId !== session.driverId || token.claims.companyId !== session.companyId) return null;
  return { uid: session.uid, driverId: session.driverId, companyId: session.companyId };
}

export async function governedBaselineReady(bound: LogoutWatcherBinding): Promise<boolean> {
  try { return parseBoundLogoutBaseline(await SecureStore.getItemAsync(BASELINE_KEY), bound) !== null; }
  catch { return false; }
}

async function consume(bound: LogoutWatcherBinding, value: unknown): Promise<boolean> {
  if (!watcherBindingMatches(bound, await currentGovernedWatcherBinding())) return false;
  const raw = await SecureStore.getItemAsync(BASELINE_KEY);
  const stored = parseBoundLogoutBaseline(raw, bound);
  if (!stored) throw new Error('governed_logout_baseline_unbound');
  if (stored.value === null) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      await SecureStore.setItemAsync(BASELINE_KEY, serializeBoundLogoutBaseline({ ...bound, value }));
    }
    return false;
  }
  if (!logoutSignalAdvanced(stored.value, value)) return false;
  await SecureStore.setItemAsync(BASELINE_KEY, serializeBoundLogoutBaseline({ ...bound, value: value as number }));
  return true;
}

export async function checkGovernedLogoutSignalOnce(): Promise<boolean> {
  return safeLogoutSignalRead(async () => {
    const bound = await currentGovernedWatcherBinding();
    if (!bound) return false;
    const snapshot = await get(ref(getDatabase(getApp()), `drivers/profiles/${bound.driverId}/logoutAt`));
    return consume(bound, snapshot.val());
  });
}

export async function startGovernedLogoutWatcher(
  onLogoutSignal: () => void | Promise<void>,
  onError?: () => void,
  expectedBinding?: LogoutWatcherBinding,
): Promise<() => void> {
  const current = await currentGovernedWatcherBinding();
  const bound = expectedBinding ?? current;
  if (expectedBinding && !watcherBindingMatches(expectedBinding, current)) return () => {};
  if (!bound) return () => {};
  if (!(await governedBaselineReady(bound))) throw new Error('governed_logout_baseline_unbound');
  let stopped = false;
  const target = ref(getDatabase(getApp()), `drivers/profiles/${bound.driverId}/logoutAt`);
  const drain = createLatestValueDrain<unknown>(async (value) => {
    try {
      const signaled = await consume(bound, value);
      if (!stopped && signaled) await onLogoutSignal();
    } catch { if (!stopped) onError?.(); }
  });
  const unsubscribe: Unsubscribe = onValue(target, (snapshot) => {
    if (!stopped) drain.push(snapshot.val());
  }, () => { if (!stopped) onError?.(); });
  const stop = () => { stopped = true; drain.stop(); unsubscribe(); };
  return stop;
}
