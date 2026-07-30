/**
 * App-switcher identity normalization (7/30): legacy eWallet branding must
 * never display; canonical = WellBuilt eQuipment / eQuip / wbequipment.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const check = (n, c, d = '') => { if (c) { pass++; console.log(`  PASS ${n}`); } else { fail++; console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); } };

const { normalizeAppRegistryEntry, normalizeAppRegistryList, EQUIPMENT_DISPLAY_NAME, EQUIPMENT_SHORT_NAME } =
  await import('../utils/normalizeAppRegistry.ts');

console.log('Section 1: normalization (pure)');
{
  const legacy = { id: 'wbew', name: 'WB eWallet', shortName: 'eWallet', deepLinkScheme: 'wbequipment', requiredTier: 'field', sortOrder: 4, enabled: true };
  const n = normalizeAppRegistryEntry(legacy);
  check('1a. WB eWallet → WellBuilt eQuipment / eQuip',
    n.name === EQUIPMENT_DISPLAY_NAME && n.shortName === EQUIPMENT_SHORT_NAME);
  check('1b. legacy id wbew + scheme wbequipment normalizes; scheme stays wbequipment',
    n.deepLinkScheme === 'wbequipment');
  check('1c. eWallet shortName alone normalizes to eQuip',
    normalizeAppRegistryEntry({ id: 'x1', name: 'Whatever', shortName: 'eWallet' }).shortName === EQUIPMENT_SHORT_NAME);
  const canonical = { id: 'wbew', name: 'WellBuilt eQuipment', shortName: 'eQuip', deepLinkScheme: 'wbequipment' };
  const cn = normalizeAppRegistryEntry(canonical);
  check('1d. already-canonical equipment metadata unchanged (idempotent)',
    cn.name === canonical.name && cn.shortName === canonical.shortName && cn.deepLinkScheme === 'wbequipment' &&
    JSON.stringify(normalizeAppRegistryEntry(cn)) === JSON.stringify(cn));
  const unrelated = { id: 'wbjsa', name: 'WB JSA', shortName: 'JSA', deepLinkScheme: 'jsaapp' };
  check('1e. unrelated registry apps unchanged',
    normalizeAppRegistryEntry(unrelated) === unrelated);
  const thirdParty = { id: 'acme', name: 'Acme Wallet Tools', shortName: 'Acme', deepLinkScheme: 'acmeapp' };
  check('1f. unknown third-party identities not broadly rewritten',
    normalizeAppRegistryEntry(thirdParty) === thirdParty);
  const legacyScheme = { id: 'wbew', name: 'WB eWallet', shortName: 'eWallet', deepLinkScheme: 'wbewallet', androidPackage: 'com.wellbuilt.ewallet' };
  const ns = normalizeAppRegistryEntry(legacyScheme);
  check('1g. legacy scheme/package rewritten to wbequipment / com.wellbuilt.equipment',
    ns.deepLinkScheme === 'wbequipment' && ns.androidPackage === 'com.wellbuilt.equipment');
  const list = normalizeAppRegistryList([legacy, unrelated]);
  check('1h. list normalization touches only the legacy entry',
    list[0].shortName === 'eQuip' && list[1] === unrelated);
}

console.log('Section 2: switcher wiring');
{
  const sw = read('components/AppSwitcher.tsx');
  check('2a. cached registry normalized AND cache rewritten (offline/restart safe)',
    sw.includes('normalizeAppRegistryList(JSON.parse(cached)') &&
    sw.includes('JSON.stringify(normalizedCached)'));
  check('2b. fetched registry normalized before render and before caching',
    sw.includes('normalizeAppRegistryList(entries)') &&
    sw.includes('JSON.stringify(normalizedEntries)') &&
    sw.includes('setApps(normalizedEntries)'));
  check('2c. fallback seed is canonical (eQuip / wbequipment); no legacy label anywhere',
    sw.includes("name: 'WellBuilt eQuipment', shortName: 'eQuip'") &&
    sw.includes("deepLinkScheme: 'wbequipment', requiredTier: 'field'") &&
    !/'(WB )?eWallet'|shortName: 'eWallet'|name: '[^']*eWallet'/.test(sw));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
