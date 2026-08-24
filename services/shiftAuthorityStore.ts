/**
 * Persistence helpers for shift-authority decisions.
 *
 * Writes only the current-shift HINT and the verified flag.
 * Never touches `@jsa/saves` or `@jsa/activeJsas`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  CURRENT_SHIFT_ID_KEY,
  CURRENT_SHIFT_VERIFIED_KEY,
  GOVERNED_RETURN_KEY,
  decideGovernedReturnMark,
  type GovernedReturnTarget,
  type ShiftAuthorityDecision,
} from './shiftAuthority';
import { WBT_READ_REQUEST_KEY } from './wbtReadRequest';

type VerifiedListener = () => void;
const verifiedListeners = new Set<VerifiedListener>();

export function subscribeShiftVerified(fn: VerifiedListener): () => void {
  verifiedListeners.add(fn);
  return () => { verifiedListeners.delete(fn); };
}

function notifyShiftVerified(): void {
  for (const fn of verifiedListeners) fn();
}

export async function persistShiftAuthorityDecision(
  decision: ShiftAuthorityDecision,
): Promise<void> {
  if (decision.currentCacheAction === 'keep_verified' && decision.activeShiftId) {
    await AsyncStorage.setItem(CURRENT_SHIFT_ID_KEY, decision.activeShiftId);
    if (decision.mayLabelActive) {
      await AsyncStorage.setItem(CURRENT_SHIFT_VERIFIED_KEY, '1');
      await AsyncStorage.removeItem(GOVERNED_RETURN_KEY);
      notifyShiftVerified();
    } else {
      await AsyncStorage.removeItem(CURRENT_SHIFT_VERIFIED_KEY);
    }
    return;
  }
  if (decision.currentCacheAction === 'clear_current') {
    await AsyncStorage.removeItem(CURRENT_SHIFT_ID_KEY);
    await AsyncStorage.removeItem(CURRENT_SHIFT_VERIFIED_KEY);
  }
}

/** Exact-owner variant for network refreshes; every durable mutation rechecks ownership. */
export async function persistShiftAuthorityDecisionIfOwned(
  decision: ShiftAuthorityDecision,
  stillCurrent: () => boolean,
): Promise<boolean> {
  const mutate = async (operation: () => Promise<void>) => {
    if (!stillCurrent()) return false;
    await operation();
    return stillCurrent();
  };
  if (decision.currentCacheAction === 'keep_verified' && decision.activeShiftId) {
    if (!(await mutate(() => AsyncStorage.setItem(CURRENT_SHIFT_ID_KEY, decision.activeShiftId!)))) return false;
    if (decision.mayLabelActive) {
      if (!(await mutate(() => AsyncStorage.setItem(CURRENT_SHIFT_VERIFIED_KEY, '1')))) return false;
      if (!(await mutate(() => AsyncStorage.removeItem(GOVERNED_RETURN_KEY)))) return false;
      if (!stillCurrent()) return false;
      notifyShiftVerified();
    } else if (!(await mutate(() => AsyncStorage.removeItem(CURRENT_SHIFT_VERIFIED_KEY)))) return false;
    return stillCurrent();
  }
  if (decision.currentCacheAction === 'clear_current') {
    if (!(await mutate(() => AsyncStorage.removeItem(CURRENT_SHIFT_ID_KEY)))) return false;
    if (!(await mutate(() => AsyncStorage.removeItem(CURRENT_SHIFT_VERIFIED_KEY)))) return false;
  }
  return stillCurrent();
}

export async function isCurrentShiftVerified(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CURRENT_SHIFT_VERIFIED_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function readGovernedReturnTarget(): Promise<GovernedReturnTarget | null> {
  try {
    const raw = await AsyncStorage.getItem(GOVERNED_RETURN_KEY);
    if (raw === 'wbt' || raw === 'suite') return raw;
    if (raw) return 'suite';
    return null;
  } catch {
    return null;
  }
}

export async function markGovernedReturnRequired(
  target: GovernedReturnTarget,
): Promise<void> {
  await AsyncStorage.setItem(GOVERNED_RETURN_KEY, target);
}

export async function captureGovernedReturnBeforeLogout(): Promise<void> {
  let authMethod: string | null = null;
  let returnTo: string | null = null;
  let hasPendingRequest = false;
  try { authMethod = await SecureStore.getItemAsync('jsa_authMethod'); } catch { /* ignore */ }
  try { returnTo = await AsyncStorage.getItem('jsa_returnTo'); } catch { /* ignore */ }
  try { hasPendingRequest = !!(await AsyncStorage.getItem(WBT_READ_REQUEST_KEY)); } catch { /* ignore */ }
  const decision = decideGovernedReturnMark({ authMethod, hasPendingRequest, returnTo });
  if (decision.mark) {
    await markGovernedReturnRequired(decision.returnTarget);
  }
}
