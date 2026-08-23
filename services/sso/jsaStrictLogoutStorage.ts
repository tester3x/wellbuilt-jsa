export interface KeyValueStore {
  remove(key: string): Promise<void>;
  read(key: string): Promise<string | null>;
}

export interface StrictClearResult {
  cleared: boolean;
  attempted: string[];
  remaining: string[];
  failures: Array<{ key: string; phase: 'delete' | 'verify'; message: string }>;
}

export const LOCAL_IDENTITY_SECURE_KEYS = [
  'jsa_driverId', 'jsa_driverName', 'jsa_passcodeHash', 'jsa_isAdmin', 'jsa_isViewer',
  'jsa_driverVerifiedAt', 'jsa_companyId', 'jsa_companyName', 'jsa_legalName',
  'jsa_authMethod', 'jsa_lastConsumedLogoutAt', 'jsa_pendingPasscodeHash',
  'jsa_pendingDisplayName', 'jsa_pendingRegistrationTime', 'jsa_pendingCompanyName',
  'jsa_pendingSecureId', 'jsa_pendingLegalName',
] as const;

export const LOCAL_IDENTITY_ASYNC_KEYS = [
  'wellbuilt-current-shift-id', '@jsa/currentShiftVerified', 'jsa_resume',
  '@jsa/truckNumber', '@jsa/trailerNumber', '@jsa/standaloneContacts',
] as const;

export const GOVERNED_SECURE_KEYS = ['jsa_governed_session', 'jsa_pkce_verifier'] as const;

export const GOVERNED_ASYNC_KEYS = [
  '@jsa/pkceAttemptMeta', '@jsa/authRecoveryLatch', '@jsa/wbtReadRequest',
  'jsa_autofill', 'jsa_returnTo', '@jsa/freshGovernedSubmitted',
  '@jsa/governedLaunchContext', '@jsa/governedLaunchOwnership',
  '@jsa/governedRequestContext', '@jsa/pendingComplete',
  '@jsa/governedUiStage', '@jsa/governedTerminalFailure',
  '@jsa/governedReturnRequired', '@jsa/ignoredInitialRequestId',
  '@jsa/attestationDraft', '@jsa/ppe/selected', '@jsa/ppe/other', '@jsa/prepared',
] as const;

export const CANONICAL_BASELINE_KEYS = ['jsa_lastCanonicalLogoutAt'] as const;

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'storage_failure';
}

export async function strictClearAndVerify(
  groups: Array<{ store: KeyValueStore; keys: readonly string[] }>,
): Promise<StrictClearResult> {
  const attempted: string[] = [];
  const remaining: string[] = [];
  const failures: StrictClearResult['failures'] = [];
  for (const { store, keys } of groups) {
    await Promise.all(keys.map(async (key) => {
      attempted.push(key);
      try { await store.remove(key); } catch (error) {
        failures.push({ key, phase: 'delete', message: message(error) });
      }
    }));
  }
  for (const { store, keys } of groups) {
    await Promise.all(keys.map(async (key) => {
      try {
        if (await store.read(key) !== null) remaining.push(key);
      } catch (error) {
        failures.push({ key, phase: 'verify', message: message(error) });
      }
    }));
  }
  return { cleared: failures.length === 0 && remaining.length === 0, attempted, remaining, failures };
}

export function requireStrictClear(result: StrictClearResult): void {
  if (!result.cleared) {
    const detail = [...result.failures.map((f) => `${f.key}:${f.phase}`), ...result.remaining.map((k) => `${k}:remaining`)];
    throw new Error(`strict_logout_storage_failed:${detail.join(',')}`);
  }
}
