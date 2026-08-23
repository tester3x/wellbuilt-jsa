import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialStartMayOwn } from '../services/sso/jsaJobDetailsIsolation.ts';
import { canonicalLogoutAdvanced, parseCanonicalProfile } from '../services/sso/jsaIdentityContract.ts';
import { runCompleteJsaLogout } from '../services/sso/jsaLogoutContract.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let pass = 0; let fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } }

check('1 fresh install governed launch needs no prior icon open', initialStartMayOwn({
  installationSeen: false, ignoredSameRequest: false, ownerSameRequest: false, ownerAgeMs: null,
}));

const full = { driverId: 'driver-a', companyId: 'company-a', displayName: 'Alias', legalName: 'Driver Legal',
  companyName: 'Liquid Gold', truckNumber: 'T-1', trailerNumber: 'TR-2', signature: 'data:image/png;base64,AAAA',
  phone: '555', cdl: 'CDL', assignedCustomers: [{ name: 'Slawson' }], assignedRoutes: ['R'], logoutAt: 200 };
const profile = parseCanonicalProfile(full, { driverId: 'driver-a', companyId: 'company-a' });
check('2 canonical UID profile includes legal name/signature/company/truck/trailer', !!profile
  && profile.legalName === 'Driver Legal' && profile.signature === full.signature
  && profile.companyName === 'Liquid Gold' && profile.truckNumber === 'T-1' && profile.trailerNumber === 'TR-2');
check('8 switching driver rejects previous profile and signature',
  parseCanonicalProfile(full, { driverId: 'driver-b', companyId: 'company-a' }) === null);
check('3 foreground Suite logout advances canonical signal', canonicalLogoutAdvanced(100, 200));
check('4 resume detects the same canonical logout signal immediately', canonicalLogoutAdvanced(100, 200));

const state = { firebaseUser: true, legacy: true, ownership: true, request: true, terminal: true,
  ui: true, authContext: true, saves: ['historical'], artifactQueue: ['pending'] };
const order = [];
await runCompleteJsaLogout({
  signOutGovernedAuth: async () => { order.push('firebase'); state.firebaseUser = false; },
  clearLegacyDriverSession: async () => { order.push('legacy'); state.legacy = false; },
  clearGovernedState: async () => { order.push('governed'); state.ownership = state.request = state.terminal = state.ui = false; },
  clearCanonicalIdentityState: async () => { order.push('canonical'); },
  resetAuthContext: async () => { order.push('context'); state.authContext = false; },
});
check('5 Settings logout awaits Firebase, legacy, governed, and AuthContext cleanup',
  order.join(',') === 'firebase,legacy,governed,canonical,context'
  && !state.firebaseUser && !state.legacy && !state.ownership && !state.request && !state.terminal && !state.ui && !state.authContext);
check('6 killed/reopened state remains logged out', !state.firebaseUser && !state.legacy && !state.authContext);
check('7 historical JSAs and artifact recovery queue survive logout',
  state.saves[0] === 'historical' && state.artifactQueue[0] === 'pending');

const resilientOrder = [];
await runCompleteJsaLogout({
  signOutGovernedAuth: async () => { resilientOrder.push('firebase'); throw new Error('test failure'); },
  clearLegacyDriverSession: async () => { resilientOrder.push('legacy'); },
  clearGovernedState: async () => { resilientOrder.push('governed'); },
  clearCanonicalIdentityState: async () => { resilientOrder.push('canonical'); },
  resetAuthContext: async () => { resilientOrder.push('context'); },
});
check('logout exhausts every identity cleanup when one store fails',
  resilientOrder.join(',') === 'firebase,legacy,governed,canonical,context');

const settings = readFileSync(join(root, 'app/settings.tsx'), 'utf8');
const auth = readFileSync(join(root, 'app/contexts/AuthContext.tsx'), 'utf8');
const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
const driver = readFileSync(join(root, 'services/driverAuth.ts'), 'utf8');
const canonical = readFileSync(join(root, 'services/sso/jsaCanonicalProfile.ts'), 'utf8');
check('Settings awaits logout and routes only to login', /await logout\(\)/.test(settings)
  && settings.includes('router.replace("/login")') && !settings.includes('router.replace("/(tabs)")'));
check('all AuthContext logout uses logoutJsaCompletely', auth.includes('logoutJsaCompletely'));
const fetchProfileBody = driver.slice(driver.indexOf('export const fetchDriverProfile'));
check('governed profile never falls back to approved hash', fetchProfileBody.includes('if (governed)')
  && fetchProfileBody.indexOf('if (governed)') < fetchProfileBody.indexOf('const session = await getDriverSession()'));
check('client-authoritative approved profile writes removed from Settings',
  !/drivers\/approved|method:\s*['"]PATCH['"]|FIREBASE_DB/.test(settings));
check('governed profile updates use authenticated callable', canonical.includes("'updateDriverProfile'"));
check('foreground cascade is bounded and resume polls immediately', layout.includes('3_000')
  && layout.includes('void pollLogout();') && layout.includes("router.replace('/login')"));
check('9 standalone remains separate from governed canonical profile',
  settings.includes('if (!governed)') && driver.includes('const session = await getDriverSession()'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
