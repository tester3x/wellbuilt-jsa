// services/driverAuth.ts
// Governed registration/profile helpers.
// Manual authentication is exclusively services/sso/jsaManualLoginLive.ts:
// authenticateDriver → Firebase Auth → sanitized governed session.
// Registration remains requestDriverRegistration (pending-only).
// Pending registration state is an opaque server-issued id only.

import * as SecureStore from "expo-secure-store";
// Legacy credential sessions are retired. Authentication state is restored only
// from an exact governed Firebase/session/claims/baseline binding.
// --- Profile / Vehicle Info ---

export interface AssignedCustomer {
  name: string;
  companyId: string;
}

/**
 * Fetch the authenticated driver's canonical governed profile.
 */
export const fetchDriverProfile = async (): Promise<{
  truckNumber: string;
  trailerNumber: string;
  legalName?: string;
  signature?: string;
  assignedCustomers: AssignedCustomer[];
  companyId?: string;
  companyName?: string;
  phone?: string;
  cdl?: string;
  driverId?: string;
  uid?: string;
} | null> => {
  const { loadGovernedSession } = await import('./sso/jsaRuntime');
  const governed = await loadGovernedSession();
  if (governed) {
    const { fetchCanonicalGovernedProfile } = await import('./sso/jsaCanonicalProfile');
    const canonical = await fetchCanonicalGovernedProfile();
    if (!canonical) return null;
    return {
      truckNumber: canonical.truckNumber || '', trailerNumber: canonical.trailerNumber || '',
      legalName: canonical.legalName || undefined, signature: canonical.signature || undefined,
      assignedCustomers: canonical.assignedCustomers as AssignedCustomer[],
      companyId: canonical.companyId, companyName: canonical.companyName || undefined,
      phone: canonical.phone || undefined, cdl: canonical.cdl || undefined,
      driverId: canonical.driverId, uid: governed.uid,
    };
  }
  return null;
};

// --- Registration ---

function functionsCallableBase(): string {
  const fromEnv = (process.env as { EXPO_PUBLIC_FUNCTIONS_BASE?: string }).EXPO_PUBLIC_FUNCTIONS_BASE;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/$/, '');
  const emu = (process.env as { EXPO_PUBLIC_FIREBASE_EMULATOR_HOST?: string }).EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
  const project = (process.env as { EXPO_PUBLIC_GCLOUD_PROJECT?: string }).EXPO_PUBLIC_GCLOUD_PROJECT
    || 'demo-wellbuilt-fn-auth-recert';
  if (emu && emu.trim()) {
    return `http://${emu.replace(/\/$/, '')}/${project}/us-central1`;
  }
  return 'https://us-central1-wellbuilt-sync.cloudfunctions.net';
}

async function callHttpsFunction<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const resp = await fetch(`${functionsCallableBase()}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok || body.error) {
    throw new Error(body?.error?.message || `Callable ${name} failed (${resp.status})`);
  }
  return (body.result || body.data) as T;
}

/** Server contract: passcode 6–128. JSA UI also caps at 12. */
export const JSA_PASSCODE_MIN_LEN = 6;
export const JSA_PASSCODE_MAX_LEN = 12;

function classifyRegistrationError(error: unknown): string {
  const msg = typeof (error as { message?: unknown })?.message === 'string'
    ? String((error as { message: string }).message)
    : '';
  if (!msg) return 'Connection error';
  if (/too many/i.test(msg)) return msg;
  if (/already registered|already-exists|already exists/i.test(msg)) return msg;
  if (/invalid|required|characters|passcode must|display name/i.test(msg)) return msg;
  if (/resource-exhausted|failed-precondition|permission-denied/i.test(msg)) return msg;
  if (/failed \(\d+\)/i.test(msg)) return msg;
  return msg;
}

/**
 * Governed pending registration for company-bound JSA flows.
 * Calls requestDriverRegistration only. Never POSTs drivers/pending, never
 * stores a passcode hash, never mints Auth or an approved session.
 */
async function requestPendingRegistration(params: {
  passcode: string;
  displayName: string;
  legalName?: string;
  companyName?: string;
}): Promise<{ success: boolean; pending?: boolean; pendingId?: string; error?: string }> {
  if (params.passcode.length < JSA_PASSCODE_MIN_LEN || params.passcode.length > 128) {
    return { success: false, error: 'Passcode must be 6–128 characters' };
  }

  try {
    const data: Record<string, unknown> = {
      displayName: params.displayName,
      passcode: params.passcode,
      source: 'wbjsa',
    };
    if (params.legalName) data.legalName = params.legalName;
    if (params.companyName) data.companyName = params.companyName;

    const result = await callHttpsFunction<{ pendingId?: string }>('requestDriverRegistration', data);
    const pendingId = typeof result?.pendingId === 'string' ? result.pendingId : '';
    if (!pendingId) {
      return { success: false, error: 'Registration did not return a pending request' };
    }
    await SecureStore.setItemAsync('jsa_pendingSecureId', pendingId);
    await SecureStore.setItemAsync('jsa_pendingDisplayName', params.displayName);
    await SecureStore.setItemAsync('jsa_pendingRegistrationTime', Date.now().toString());
    if (params.legalName) {
      await SecureStore.setItemAsync('jsa_pendingLegalName', params.legalName);
    }
    if (params.companyName) {
      await SecureStore.setItemAsync('jsa_pendingCompanyName', params.companyName);
    }
    return { success: true, pending: true, pendingId };
  } catch (error: unknown) {
    console.error('[DriverAuth-JSA] Pending registration error:', classifyRegistrationError(error));
    return { success: false, error: classifyRegistrationError(error) };
  }
}

/**
 * Request a pending company registration through requestDriverRegistration.
 * Does not write drivers/pending from the client and does not store a hash.
 */
export const submitRegistration = async (params: {
  passcode: string;
  displayName: string;
  companyName?: string;
  legalName?: string;
}): Promise<{ success: boolean; pending?: boolean; pendingId?: string; error?: string }> => {
  return requestPendingRegistration({
    passcode: params.passcode,
    displayName: params.displayName,
    companyName: params.companyName,
    legalName: params.legalName,
  });
};

/**
 * Get pending registration info
 */
export const getSecurePendingId = async (): Promise<string | null> => {
  return SecureStore.getItemAsync('jsa_pendingSecureId');
};

export const getPendingRegistration = async (): Promise<{
  displayName: string;
  companyName?: string;
} | null> => {
  const displayName = await SecureStore.getItemAsync("jsa_pendingDisplayName");
  const companyName = await SecureStore.getItemAsync("jsa_pendingCompanyName");
  const secureId = await SecureStore.getItemAsync("jsa_pendingSecureId");

  if (secureId && displayName) {
    return { displayName, companyName: companyName || undefined };
  }
  return null;
};

/**
 * Check registration status via the governed pendingId contract only.
 */
export const checkRegistrationStatus = async (): Promise<
  "pending" | "approved" | "rejected" | "none"
> => {
  const pendingId = await SecureStore.getItemAsync('jsa_pendingSecureId');
  if (!pendingId) {
    return 'none';
  }
  try {
    const result = await callHttpsFunction<{ status?: string }>(
      'checkDriverRegistrationStatus',
      { pendingId },
    );
    const status = result?.status;
    if (status === 'approved' || status === 'rejected' || status === 'pending' || status === 'none') {
      return status;
    }
    return 'pending';
  } catch (error) {
    console.error('[DriverAuth-JSA] Error checking secure pending status:', error);
    return 'pending';
  }
};

/**
 * Approval never mints a local hash session. The driver must sign in normally.
 */
export const completeRegistration = async (): Promise<{
  success: boolean;
  driverId?: string;
  displayName?: string;
  error?: string;
}> => {
  return {
    success: false,
    error: 'Registration approved. Please sign in.',
  };
};

/**
 * Clear pending registration
 */
export const clearPendingRegistration = async (): Promise<void> => {
  await SecureStore.deleteItemAsync("jsa_pendingPasscodeHash");
  await SecureStore.deleteItemAsync("jsa_pendingDisplayName");
  await SecureStore.deleteItemAsync("jsa_pendingRegistrationTime");
  await SecureStore.deleteItemAsync("jsa_pendingCompanyName");
  await SecureStore.deleteItemAsync("jsa_pendingSecureId");
  await SecureStore.deleteItemAsync("jsa_pendingLegalName");
};
