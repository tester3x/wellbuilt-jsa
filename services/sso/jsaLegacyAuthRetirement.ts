/** Obsolete authentication keys only. Pending registration and JSA data are excluded. */
export const LEGACY_AUTH_KEYS = Object.freeze([
  'jsa_driverId',
  'jsa_driverName',
  'jsa_passcodeHash',
  'jsa_isAdmin',
  'jsa_isViewer',
  'jsa_driverVerifiedAt',
  'jsa_companyId',
  'jsa_companyName',
  'jsa_legalName',
  'jsa_authMethod',
  'jsa_lastConsumedLogoutAt',
]);

export interface LegacyAuthStore {
  remove(key: string): Promise<void>;
  read(key: string): Promise<string | null>;
}

export async function retireLegacyAuthentication(store: LegacyAuthStore) {
  const attempted: string[] = [];
  const failures: string[] = [];
  for (const key of LEGACY_AUTH_KEYS) {
    attempted.push(key);
    try { await store.remove(key); } catch { failures.push(`${key}:delete`); }
  }
  const remaining: string[] = [];
  for (const key of LEGACY_AUTH_KEYS) {
    try { if (await store.read(key) !== null) remaining.push(key); }
    catch { failures.push(`${key}:verify`); }
  }
  return { retired: failures.length === 0 && remaining.length === 0, attempted, failures, remaining };
}
