// services/driverAuth.ts
// Driver authentication for WB JSA — same Firebase paths, same auth flow as WB S / WB M.
// Both apps share the `wellbuilt-sync` Firebase project so a driver approved in WB M
// is automatically approved here.
//
// How it works:
// 1. Driver enters name + passcode
// 2. App SHA-256 hashes (name.toLowerCase() + passcode) client-side
// 3. Login: Find driver by hash, verify name matches
// 4. Registration: Post to drivers/pending/, admin approves to drivers/approved/
//
// Structure:
// - drivers/approved/{passcodeHash}/ = { displayName, active, approvedAt, isAdmin? }
// - drivers/pending/{key}/ = { displayName, passcodeHash, requestedAt }

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration (same project as WB M / WB S: wellbuilt-sync)
const FIREBASE_DATABASE_URL = "https://wellbuilt-sync-default-rtdb.firebaseio.com";
const FIREBASE_API_KEY = "AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI";

// Firebase paths
const DRIVERS_PENDING = "drivers/pending";
const DRIVERS_APPROVED = "drivers/approved";

// --- Interfaces ---

export interface DriverInfo {
  driverId: string;
  displayName: string;
  passcodeHash: string;
  approvedAt: string;
  active: boolean;
}

export interface DriverSession {
  driverId: string;
  displayName: string;
  legalName?: string;
  passcodeHash: string;
  isAdmin: boolean;
  isViewer: boolean;
  companyId?: string;
  companyName?: string;
  tier?: 'free' | 'company';
}

// --- Firebase helpers ---

/** Network timeout for all Firebase requests (ms) */
const FIREBASE_TIMEOUT_MS = 10000;

const buildFirebaseUrl = (path: string): string => {
  let url = `${FIREBASE_DATABASE_URL}/${path}.json`;
  if (FIREBASE_API_KEY) {
    url += `?auth=${FIREBASE_API_KEY}`;
  }
  return url;
};

/**
 * Fetch with AbortController timeout.
 * Prevents the app from hanging indefinitely on bad/slow connections.
 */
const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number = FIREBASE_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`Firebase request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const firebaseGet = async (path: string): Promise<any> => {
  const url = buildFirebaseUrl(path);
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Firebase GET failed (${response.status})`);
  }

  return response.json();
};

const firebasePost = async (path: string, data: any): Promise<string> => {
  const url = buildFirebaseUrl(path);
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Firebase POST failed (${response.status})`);
  }

  const result = await response.json();
  return result.name; // Firebase returns {"name": "generated-key"}
};

const firebasePatch = async (path: string, data: any): Promise<void> => {
  const url = buildFirebaseUrl(path);
  const response = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Firebase PATCH failed (${response.status})`);
  }
};

// --- Crypto helpers ---

/**
 * Hash name + passcode using SHA-256.
 * Same algorithm as WB M, WB T, WB S: SHA-256(name.toLowerCase().trim() + passcode)
 * Including name allows different drivers to share the same passcode.
 */
export const hashPasscode = async (passcode: string, name?: string): Promise<string> => {
  const input = name ? name.toLowerCase().trim() + passcode : passcode;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input
  );
  return hash.toLowerCase();
};

// --- Authentication ---

/**
 * Verify login with name + passcode
 * Looks up driver by passcode hash, then verifies name matches
 *
 * Structure: drivers/approved/{passcodeHash}/ = { displayName, active, isAdmin? }
 * Also supports legacy structure: drivers/approved/{passcodeHash}/{deviceId}/
 */
export const verifyLogin = async (
  displayName: string,
  passcode: string
): Promise<{
  valid: boolean;
  driverId?: string;
  displayName?: string;
  legalName?: string;
  passcodeHash?: string;
  isAdmin?: boolean;
  isViewer?: boolean;
  companyId?: string;
  companyName?: string;
  error?: string;
}> => {
  console.log("[DriverAuth-JSA] Verifying login for:", displayName);

  try {
    const hash = await hashPasscode(passcode, displayName);
    console.log("[DriverAuth-JSA] Hash:", hash.slice(0, 8) + "...");

    // Look up by passcode hash
    const driverData = await firebaseGet(`${DRIVERS_APPROVED}/${hash}`);

    if (!driverData) {
      console.log("[DriverAuth-JSA] No driver found with this passcode");
      return { valid: false, error: "Invalid name or passcode" };
    }

    // Check if this is the new flat structure (has displayName directly)
    if (driverData.displayName) {
      if (driverData.active === false) {
        return { valid: false, error: "This account has been deactivated" };
      }

      if (driverData.displayName.toLowerCase() !== displayName.toLowerCase()) {
        console.log("[DriverAuth-JSA] Name mismatch");
        return { valid: false, error: "Invalid name or passcode" };
      }

      console.log("[DriverAuth-JSA] Login verified for:", driverData.displayName);

      return {
        valid: true,
        driverId: hash,
        displayName: driverData.displayName,
        // legalName can live at the root OR under profile/ (approval forms
        // write to profile.legalName). Check both so driverName field
        // doesn't fall back to the login displayName (e.g. "TabletS10").
        legalName: driverData.profile?.legalName || driverData.legalName || undefined,
        passcodeHash: hash,
        isAdmin: driverData.isAdmin === true,
        isViewer: driverData.isViewer === true,
        companyId: driverData.companyId || undefined,
        companyName: driverData.companyName || undefined,
      };
    }

    // Legacy structure: drivers/approved/{hash}/{deviceId}/ = { displayName, ... }
    for (const key of Object.keys(driverData)) {
      const entry = driverData[key];
      if (
        entry.displayName?.toLowerCase() === displayName.toLowerCase() &&
        entry.active !== false
      ) {
        console.log("[DriverAuth-JSA] Login verified (legacy) for:", entry.displayName);

        return {
          valid: true,
          driverId: hash,
          displayName: entry.displayName,
          passcodeHash: hash,
          isAdmin: entry.isAdmin === true,
          isViewer: entry.isViewer === true,
          companyId: entry.companyId || undefined,
          companyName: entry.companyName || undefined,
        };
      }
    }

    console.log("[DriverAuth-JSA] Name mismatch in legacy structure");
    return { valid: false, error: "Invalid name or passcode" };
  } catch (error) {
    console.error("[DriverAuth-JSA] Error verifying login:", error);
    return { valid: false, error: "Connection error" };
  }
};

// --- Session Management ---

/**
 * Save driver session after successful passcode verification
 */
export const saveDriverSession = async (
  driverId: string,
  displayName: string,
  passcodeHash: string,
  isAdmin: boolean = false,
  isViewer: boolean = false,
  companyId?: string,
  companyName?: string,
  legalName?: string,
  authMethod?: 'sso' | 'manual'
): Promise<void> => {
  await SecureStore.setItemAsync("jsa_driverId", driverId);
  await SecureStore.setItemAsync("jsa_driverName", displayName);
  await SecureStore.setItemAsync("jsa_passcodeHash", passcodeHash);
  await SecureStore.setItemAsync("jsa_isAdmin", isAdmin ? "true" : "false");
  await SecureStore.setItemAsync("jsa_isViewer", isViewer ? "true" : "false");
  await SecureStore.setItemAsync("jsa_driverVerifiedAt", Date.now().toString());
  if (companyId) {
    await SecureStore.setItemAsync("jsa_companyId", companyId);
  } else {
    await SecureStore.deleteItemAsync("jsa_companyId");
  }
  if (companyName) {
    await SecureStore.setItemAsync("jsa_companyName", companyName);
  } else {
    await SecureStore.deleteItemAsync("jsa_companyName");
  }
  if (legalName) {
    await SecureStore.setItemAsync("jsa_legalName", legalName);
  } else {
    await SecureStore.deleteItemAsync("jsa_legalName");
  }
  // Track how driver logged in. Audit-only post-2026-04-30 — the cascade
  // logout policy is now driver-hash-scoped regardless of authMethod
  // (manual + SSO both honor the WB S signal, mirroring WB T).
  if (authMethod) await SecureStore.setItemAsync("jsa_authMethod", authMethod);

  // Cascade-logout baseline: snapshot the current RTDB logoutAt for this
  // hash so checkRtdbLogoutSignal in _layout.tsx can fire on any
  // STRICTLY NEWER logoutAt going forward. Best-effort; falls back to
  // NOW if the seed fetch fails (offline). Stale signals from before
  // this moment will never fire (they're <= baseline).
  try {
    const FIREBASE_DB = 'https://wellbuilt-sync-default-rtdb.firebaseio.com';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let baseline: string;
    try {
      const resp = await fetch(`${FIREBASE_DB}/drivers/approved/${passcodeHash}/logoutAt.json`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (resp.ok) {
        const v = await resp.json();
        baseline = (typeof v === 'string' && v.length > 0) ? v : new Date().toISOString();
      } else {
        baseline = new Date().toISOString();
      }
    } catch {
      clearTimeout(timer);
      baseline = new Date().toISOString();
    }
    await SecureStore.setItemAsync('jsa_lastConsumedLogoutAt', baseline);
  } catch {
    // Best-effort; if SecureStore write fails, the no-baseline fallback
    // in checkRtdbLogoutSignal will compare against NOW on first check.
  }

  // Clear any pending registration data
  await clearPendingRegistration();
};

/**
 * Get current driver session
 */
export const getDriverSession = async (): Promise<DriverSession | null> => {
  const driverId = await SecureStore.getItemAsync("jsa_driverId");
  const displayName = await SecureStore.getItemAsync("jsa_driverName");
  const passcodeHash = await SecureStore.getItemAsync("jsa_passcodeHash");
  const isAdminStr = await SecureStore.getItemAsync("jsa_isAdmin");
  const isViewerStr = await SecureStore.getItemAsync("jsa_isViewer");
  const companyId = await SecureStore.getItemAsync("jsa_companyId");
  const companyName = await SecureStore.getItemAsync("jsa_companyName");
  const legalName = await SecureStore.getItemAsync("jsa_legalName");

  if (driverId && displayName && passcodeHash) {
    return {
      driverId,
      displayName,
      legalName: legalName || undefined,
      passcodeHash,
      isAdmin: isAdminStr === "true",
      isViewer: isViewerStr === "true",
      companyId: companyId || undefined,
      companyName: companyName || undefined,
    };
  }
  return null;
};

/**
 * Check if driver is verified (has a valid session)
 */
export const isDriverVerified = async (): Promise<boolean> => {
  const session = await getDriverSession();
  return session !== null;
};

/**
 * Revalidate driver session - verify driver is still approved.
 * Also refreshes session data (legalName, companyId, etc.) from RTDB
 * so stale SecureStore values get updated on app resume.
 */
export const revalidateDriverSession = async (): Promise<boolean> => {
  const session = await getDriverSession();
  if (!session) return false;

  try {
    const hash = session.passcodeHash;
    if (!hash) {
      console.log("[DriverAuth-JSA] No passcodeHash in session");
      return false;
    }

    console.log("[DriverAuth-JSA] Revalidating session for hash:", hash.slice(0, 8) + "...");
    const driverData = await firebaseGet(`${DRIVERS_APPROVED}/${hash}`);

    if (!driverData) {
      console.log("[DriverAuth-JSA] Driver not found, clearing session...");
      await clearDriverSession();
      return false;
    }

    // Check new structure (displayName at root)
    if (driverData.displayName) {
      if (driverData.active === false) {
        console.log("[DriverAuth-JSA] Driver deactivated, clearing session...");
        await clearDriverSession();
        return false;
      }

      // Refresh session with latest RTDB data (legalName, companyId, etc.)
      const freshLegalName = driverData.profile?.legalName || driverData.legalName || undefined;
      const freshCompanyId = driverData.companyId || undefined;
      const freshCompanyName = driverData.companyName || undefined;
      const needsUpdate =
        freshLegalName !== session.legalName ||
        freshCompanyId !== session.companyId ||
        freshCompanyName !== session.companyName;

      if (needsUpdate) {
        console.log("[DriverAuth-JSA] Refreshing session data from RTDB");
        if (freshLegalName) await SecureStore.setItemAsync("jsa_legalName", freshLegalName);
        if (freshCompanyId) await SecureStore.setItemAsync("jsa_companyId", freshCompanyId);
        if (freshCompanyName) await SecureStore.setItemAsync("jsa_companyName", freshCompanyName);
      }

      return true;
    }

    // Check legacy structure (nested by deviceId)
    for (const key of Object.keys(driverData)) {
      const entry = driverData[key];
      if (entry.displayName?.toLowerCase() === session.displayName.toLowerCase()) {
        if (entry.active === false) {
          console.log("[DriverAuth-JSA] Driver deactivated (legacy), clearing session...");
          await clearDriverSession();
          return false;
        }
        return true;
      }
    }

    console.log("[DriverAuth-JSA] Driver name not found in approved list");
    await clearDriverSession();
    return false;
  } catch (error) {
    console.error("[DriverAuth-JSA] Error revalidating session:", error);
    // Don't clear session on network error - allow offline use
    return true;
  }
};

/**
 * Clear driver session (logout)
 */
export const clearDriverSession = async (): Promise<void> => {
  await SecureStore.deleteItemAsync("jsa_driverId");
  await SecureStore.deleteItemAsync("jsa_driverName");
  await SecureStore.deleteItemAsync("jsa_passcodeHash");
  await SecureStore.deleteItemAsync("jsa_isAdmin");
  await SecureStore.deleteItemAsync("jsa_isViewer");
  await SecureStore.deleteItemAsync("jsa_driverVerifiedAt");
  await SecureStore.deleteItemAsync("jsa_companyId");
  await SecureStore.deleteItemAsync("jsa_companyName");
  await SecureStore.deleteItemAsync("jsa_legalName");
  await SecureStore.deleteItemAsync("jsa_authMethod");
  // Cascade-logout baseline — must be cleared so the next login's
  // saveDriverSession seeds a fresh snapshot from RTDB rather than
  // carrying forward a stale baseline from the prior session.
  await SecureStore.deleteItemAsync("jsa_lastConsumedLogoutAt");
  await clearPendingRegistration();
  // vc51.9B defence in depth: a VERIFIED logout (the only path here —
  // ambiguous network failures never reach clearDriverSession) must not
  // leak the prior driver's period or pending request into the next
  // session. Cached shift ids are hints, never authority — and a hint
  // from a logged-out session is pure poison. Saved/historical JSAs
  // (@jsa/saves, @jsa/activeJsas) are deliberately preserved.
  try {
    await AsyncStorage.multiRemove([
      "wellbuilt-current-shift-id",
      "@jsa/wbtReadRequest",
      "jsa_autofill",
      "jsa_returnTo",
      "jsa_resume",
    ]);
  } catch (err) {
    console.warn("[logout] period-cache clear failed (non-fatal):", err);
  }
};

// --- Profile / Vehicle Info ---

export interface AssignedCustomer {
  name: string;
  companyId: string;
}

/**
 * Fetch driver's full profile from Firebase RTDB.
 * Reads truck#, trailer#, legalName, and assignedCustomers.
 * Same RTDB paths as WB T — profile/ for vehicle info, root for assignedCustomers.
 */
export const fetchDriverProfile = async (): Promise<{
  truckNumber: string;
  trailerNumber: string;
  legalName?: string;
  signature?: string;
  assignedCustomers: AssignedCustomer[];
} | null> => {
  const session = await getDriverSession();
  if (!session) return null;

  try {
    const hash = session.passcodeHash;
    const driverData = await firebaseGet(`${DRIVERS_APPROVED}/${hash}`);
    if (!driverData) return null;

    const profile = driverData.profile || {};
    const assignedCustomers: AssignedCustomer[] = [];
    if (Array.isArray(driverData.assignedCustomers)) {
      for (const c of driverData.assignedCustomers) {
        if (c && typeof c.name === 'string' && typeof c.companyId === 'string') {
          assignedCustomers.push({ name: c.name, companyId: c.companyId });
        }
      }
    }

    // Signature: base64 PNG from profile (same path WB T / WB S use)
    const sig = profile.signature || undefined;

    return {
      truckNumber: profile.truckNumber || driverData.truckNumber || '',
      trailerNumber: profile.trailerNumber || driverData.trailerNumber || '',
      legalName: profile.legalName || driverData.legalName || undefined,
      signature: sig && typeof sig === 'string' && sig.length > 50 ? sig : undefined,
      assignedCustomers,
    };
  } catch (err) {
    console.warn('[DriverAuth-JSA] Failed to fetch driver profile:', err);
    return null;
  }
};

// --- Registration ---

/**
 * Check if a passcode is available (not already in use)
 */
export const isPasscodeAvailable = async (
  passcode: string,
  name?: string
): Promise<{ available: boolean; reason?: string }> => {
  try {
    const hash = await hashPasscode(passcode, name);

    // Check if passcode is already approved
    const existingDriver = await firebaseGet(`${DRIVERS_APPROVED}/${hash}`);
    if (existingDriver) {
      return { available: false, reason: "This passcode is already in use" };
    }

    // Check pending registrations
    const pendingDrivers = await firebaseGet(DRIVERS_PENDING);
    if (pendingDrivers) {
      for (const key of Object.keys(pendingDrivers)) {
        const pending = pendingDrivers[key];
        if (pending.passcodeHash === hash) {
          return { available: false, reason: "This passcode has a pending registration" };
        }
      }
    }

    return { available: true };
  } catch (error) {
    console.error("[DriverAuth-JSA] Error checking passcode availability:", error);
    return { available: false, reason: "Connection error" };
  }
};

/**
 * Register as a standalone/free-tier driver.
 * SECURITY: never client-write drivers/approved. Server callable mints
 * credentials + profile via Admin SDK (registerStandaloneDriver).
 */
export const registerStandalone = async (params: {
  passcode: string;
  displayName: string;
  legalName?: string;
}): Promise<{ success: boolean; error?: string }> => {
  console.log("[DriverAuth-JSA] Standalone registration for:", params.displayName);

  try {
    const CALLABLE =
      'https://us-central1-wellbuilt-sync.cloudfunctions.net/registerStandaloneDriver';
    const resp = await fetch(CALLABLE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          displayName: params.displayName,
          passcode: params.passcode,
          legalName: params.legalName,
        },
      }),
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok || body.error) {
      const msg = body?.error?.message || `Registration failed (${resp.status})`;
      // During dual-run, if function not deployed yet, fail closed (no self-approve).
      return { success: false, error: msg };
    }
    const result = body.result || {};
    const driverId = result.driverId || result.displayName;
    await SecureStore.setItemAsync('jsa_passcodeHash', driverId);
    await SecureStore.setItemAsync('jsa_driverName', result.displayName || params.displayName);
    await SecureStore.setItemAsync('jsa_driverVerifiedAt', Date.now().toString());
    await SecureStore.setItemAsync('jsa_authMethod', 'manual');
    if (params.legalName) {
      await SecureStore.setItemAsync('jsa_legalName', params.legalName);
    }
    if (result.driverId) {
      await SecureStore.setItemAsync('jsa_secureDriverId', result.driverId);
    }
    console.log('[DriverAuth-JSA] Standalone registration complete via server');
    return { success: true };
  } catch (error: any) {
    console.error('[DriverAuth-JSA] Standalone registration error:', error);
    return { success: false, error: 'Connection error' };
  }
};

/**
 * Submit a registration request
 * Creates entry in Firebase drivers/pending/
 */
export const submitRegistration = async (params: {
  passcode: string;
  displayName: string;
  companyName?: string;
  legalName?: string;
}): Promise<{ success: boolean; error?: string }> => {
  console.log("[DriverAuth-JSA] Submitting registration for:", params.displayName, "company:", params.companyName);

  try {
    const hash = await hashPasscode(params.passcode, params.displayName);

    const registrationData: Record<string, string> = {
      displayName: params.displayName,
      passcodeHash: hash,
      requestedAt: new Date().toISOString(),
      source: 'wbjsa',
    };
    if (params.companyName) {
      registrationData.companyName = params.companyName;
    }
    if (params.legalName) {
      registrationData.legalName = params.legalName;
    }

    await firebasePost(DRIVERS_PENDING, registrationData);

    // Save pending registration locally
    await SecureStore.setItemAsync("jsa_pendingPasscodeHash", hash);
    await SecureStore.setItemAsync("jsa_pendingDisplayName", params.displayName);
    await SecureStore.setItemAsync("jsa_pendingRegistrationTime", Date.now().toString());
    if (params.companyName) {
      await SecureStore.setItemAsync("jsa_pendingCompanyName", params.companyName);
    }

    console.log("[DriverAuth-JSA] Registration submitted successfully");
    return { success: true };
  } catch (error) {
    console.error("[DriverAuth-JSA] Error submitting registration:", error);
    return { success: false, error: "Connection error" };
  }
};

/**
 * Get pending registration info
 */
export const getPendingRegistration = async (): Promise<{
  passcodeHash: string;
  displayName: string;
  companyName?: string;
} | null> => {
  const passcodeHash = await SecureStore.getItemAsync("jsa_pendingPasscodeHash");
  const displayName = await SecureStore.getItemAsync("jsa_pendingDisplayName");
  const companyName = await SecureStore.getItemAsync("jsa_pendingCompanyName");

  if (passcodeHash && displayName) {
    return { passcodeHash, displayName, companyName: companyName || undefined };
  }
  return null;
};

/**
 * Check registration status
 */
export const checkRegistrationStatus = async (): Promise<
  "pending" | "approved" | "rejected" | "none"
> => {
  const pending = await getPendingRegistration();
  if (!pending) {
    return "none";
  }

  try {
    // Check if approved
    const driver = await firebaseGet(`${DRIVERS_APPROVED}/${pending.passcodeHash}`);
    if (driver) {
      return "approved";
    }

    // Check if still in pending
    const pendingDrivers = await firebaseGet(DRIVERS_PENDING);
    if (pendingDrivers) {
      for (const key of Object.keys(pendingDrivers)) {
        const registration = pendingDrivers[key];
        if (registration.passcodeHash === pending.passcodeHash) {
          return "pending";
        }
      }
    }

    // Not in approved, not in pending = rejected
    return "rejected";
  } catch (error) {
    console.error("[DriverAuth-JSA] Error checking registration status:", error);
    return "pending";
  }
};

/**
 * Complete registration after approval
 */
export const completeRegistration = async (): Promise<{
  success: boolean;
  driverId?: string;
  displayName?: string;
  error?: string;
}> => {
  const pending = await getPendingRegistration();
  if (!pending) {
    return { success: false, error: "No pending registration" };
  }

  try {
    const driverData = await firebaseGet(`${DRIVERS_APPROVED}/${pending.passcodeHash}`);

    if (!driverData) {
      return { success: false, error: "Driver not found in approved list" };
    }

    const displayName = driverData.displayName || pending.displayName;
    const isAdmin = driverData.isAdmin === true;
    const isViewer = driverData.isViewer === true;
    const companyId = driverData.companyId || undefined;
    const companyName = driverData.companyName || undefined;

    await saveDriverSession(pending.passcodeHash, displayName, pending.passcodeHash, isAdmin, isViewer, companyId, companyName);
    return {
      success: true,
      driverId: pending.passcodeHash,
      displayName,
    };
  } catch (error) {
    console.error("[DriverAuth-JSA] Error completing registration:", error);
    return { success: false, error: "Connection error" };
  }
};

/**
 * Clear pending registration
 */
export const clearPendingRegistration = async (): Promise<void> => {
  await SecureStore.deleteItemAsync("jsa_pendingPasscodeHash");
  await SecureStore.deleteItemAsync("jsa_pendingDisplayName");
  await SecureStore.deleteItemAsync("jsa_pendingRegistrationTime");
  await SecureStore.deleteItemAsync("jsa_pendingCompanyName");
};
