/**
 * App-switcher identity normalization (7/30). The canonical equipment app is
 * "WellBuilt eQuipment" (compact: "eQuip", scheme wbequipment, package
 * com.wellbuilt.equipment). Firestore app_registry / cached metadata may
 * still carry legacy eWallet branding (id wbew, name "WB eWallet", shortName
 * "eWallet") — the switcher renders shortName, so legacy remote/cached
 * records leaked "eWallet" into the UI. Normalize KNOWN legacy equipment
 * identity only; unrelated registry apps and unknown third-party identities
 * pass through untouched. Idempotent. Mirrors wellbuilt-ewallet 4d07a4c.
 */

export interface AppRegistryEntryLike {
  id?: string;
  name?: string;
  shortName?: string;
  deepLinkScheme?: string;
  androidPackage?: string;
}

// Word-bounded so third-party names like "Acme Wallet" never match.
const LEGACY_EWALLET_NAME = /\be[\s-]?wallet\b/i;
const LEGACY_IDS = new Set(['wbew', 'ewallet', 'wb-ewallet', 'wellbuilt-ewallet']);
const LEGACY_SCHEMES = new Set(['wbequipment', 'wbewallet', 'wellbuilt-ewallet', 'ewallet']);
const LEGACY_PACKAGES = new Set([
  'com.wellbuilt.equipment',
  'com.wellbuilt.ewallet',
  'com.wellbuilt.ewallet.dev',
]);

export const EQUIPMENT_DISPLAY_NAME = 'WellBuilt eQuipment';
export const EQUIPMENT_SHORT_NAME = 'eQuip';
export const EQUIPMENT_SCHEME = 'wbequipment';
export const EQUIPMENT_PACKAGE = 'com.wellbuilt.equipment';

export function isLegacyEquipmentIdentity(entry: AppRegistryEntryLike): boolean {
  const id = String(entry.id || '').toLowerCase();
  const scheme = String(entry.deepLinkScheme || '').toLowerCase();
  const pkg = String(entry.androidPackage || '').toLowerCase();
  if (LEGACY_IDS.has(id)) return true;
  if (LEGACY_SCHEMES.has(scheme)) return true;
  if (LEGACY_PACKAGES.has(pkg)) return true;
  if (LEGACY_EWALLET_NAME.test(String(entry.name || ''))) return true;
  if (LEGACY_EWALLET_NAME.test(String(entry.shortName || ''))) return true;
  return false;
}

/** Copy with user-facing eWallet branding replaced by canonical eQuipment.
 *  Never invents apps; only renames the KNOWN legacy identity. */
export function normalizeAppRegistryEntry<T extends AppRegistryEntryLike>(entry: T): T {
  if (!isLegacyEquipmentIdentity(entry)) return entry;
  const scheme = String(entry.deepLinkScheme || '').toLowerCase();
  const pkg = String(entry.androidPackage || '').toLowerCase();
  return {
    ...entry,
    name: EQUIPMENT_DISPLAY_NAME,
    shortName: EQUIPMENT_SHORT_NAME,
    deepLinkScheme:
      !entry.deepLinkScheme || LEGACY_SCHEMES.has(scheme) ? EQUIPMENT_SCHEME : entry.deepLinkScheme,
    androidPackage:
      !entry.androidPackage || pkg.includes('ewallet') ? EQUIPMENT_PACKAGE : entry.androidPackage,
  };
}

export function normalizeAppRegistryList<T extends AppRegistryEntryLike>(entries: T[]): T[] {
  return entries.map((e) => normalizeAppRegistryEntry(e));
}
