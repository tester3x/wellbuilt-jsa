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
