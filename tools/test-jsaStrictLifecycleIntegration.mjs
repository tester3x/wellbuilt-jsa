import {
  GOVERNED_ASYNC_KEYS,
  GOVERNED_SECURE_KEYS,
  LOCAL_IDENTITY_ASYNC_KEYS,
  LOCAL_IDENTITY_SECURE_KEYS,
  strictClearAndVerify,
} from '../services/sso/jsaStrictLogoutStorage.ts';
import { classifyGovernedStartup } from '../services/sso/jsaIdentityStartupContract.ts';
import {
  createLatestValueDrain,
  createWatcherMountCoordinator,
  parseBoundLogoutBaseline,
  serializeBoundLogoutBaseline,
} from '../services/sso/jsaLogoutWatcherContract.ts';
import { logoutTransitionAuthorized, runCompleteJsaLogout } from '../services/sso/jsaLogoutContract.ts';
import { parseCanonicalProfile } from '../services/sso/jsaIdentityContract.ts';
import { runSignatureSaveSingleFlight, saveGovernedSignatureAfterConfirmation } from '../services/sso/jsaSignatureSaveContract.ts';

let pass = 0; let fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } }
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
function memoryStore(initial = {}, failDelete = new Set()) {
  const data = new Map(Object.entries(initial)); const attempted = [];
  return {
    data, attempted,
    store: {
      remove: async (key) => { attempted.push(key); if (failDelete.has(key)) throw new Error('delete_failed'); data.delete(key); },
      read: async (key) => data.get(key) ?? null,
    },
  };
}

const secureFail = memoryStore({ jsa_governed_session: 'session', jsa_pkce_verifier: 'v' }, new Set(['jsa_governed_session']));
const asyncOk = memoryStore(Object.fromEntries(GOVERNED_ASYNC_KEYS.map((k) => [k, 'x'])));
let strict = await strictClearAndVerify([{ store: secureFail.store, keys: GOVERNED_SECURE_KEYS }, { store: asyncOk.store, keys: GOVERNED_ASYNC_KEYS }]);
check('1 governed session deletion failure is observable and all governed keys attempted', !strict.cleared
  && strict.remaining.includes('jsa_governed_session') && asyncOk.attempted.length === GOVERNED_ASYNC_KEYS.length);

const localSecure = memoryStore(Object.fromEntries(LOCAL_IDENTITY_SECURE_KEYS.map((k) => [k, 'x'])));
const localFail = memoryStore({ '@jsa/truckNumber': 'A', '@jsa/trailerNumber': 'B', '@jsa/standaloneContacts': 'C' }, new Set(['@jsa/truckNumber']));
strict = await strictClearAndVerify([{ store: localSecure.store, keys: LOCAL_IDENTITY_SECURE_KEYS }, { store: localFail.store, keys: LOCAL_IDENTITY_ASYNC_KEYS }]);
check('2 vehicle deletion failure keeps local section false', !strict.cleared && strict.remaining.includes('@jsa/truckNumber'));
check('3 trailer/contact and every other key attempted after truck failure', localFail.attempted.length === LOCAL_IDENTITY_ASYNC_KEYS.length
  && localFail.attempted.includes('@jsa/trailerNumber') && localFail.attempted.includes('@jsa/standaloneContacts'));

const saves = { '@jsa/saves': 'history', '@jsa/activeJsas': 'active', '@jsa/governedArtifactQueue': 'artifact' };
const allLocal = memoryStore({ ...saves, ...Object.fromEntries(LOCAL_IDENTITY_ASYNC_KEYS.map((k) => [k, 'x'])) });
const allSecure = memoryStore(Object.fromEntries(LOCAL_IDENTITY_SECURE_KEYS.map((k) => [k, 'x'])));
strict = await strictClearAndVerify([{ store: allSecure.store, keys: LOCAL_IDENTITY_SECURE_KEYS }, { store: allLocal.store, keys: LOCAL_IDENTITY_ASYNC_KEYS }]);
check('4 successful strict logout verifies every required key absent', strict.cleared && strict.remaining.length === 0);
check('5 historical and artifact keys remain present', Object.entries(saves).every(([k, v]) => allLocal.data.get(k) === v));

const pair = { uid: 'u', driverId: 'd', companyId: 'c' };
check('6 restart raw session without Firebase fails closed', classifyGovernedStartup({ rawSessionPresent: true, session: pair, firebaseUid: null, tokenDriverId: null, tokenCompanyId: null }) === 'raw_session_without_firebase');
check('7 restart Firebase without raw session fails closed', classifyGovernedStartup({ rawSessionPresent: false, session: null, firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c' }) === 'firebase_without_raw_session');
check('8 exact UID/driver/company pair is usable', classifyGovernedStartup({ rawSessionPresent: true, session: pair, firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c', baselineBound: true }) === 'usable');
check('restart UID and authority mismatches fail closed',
  classifyGovernedStartup({ rawSessionPresent: true, session: pair, firebaseUid: 'x', tokenDriverId: 'd', tokenCompanyId: 'c' }) === 'uid_mismatch'
  && classifyGovernedStartup({ rawSessionPresent: true, session: pair, firebaseUid: 'u', tokenDriverId: 'x', tokenCompanyId: 'c' }) === 'authority_mismatch');
check('missing or cross-driver baseline fails closed', classifyGovernedStartup({ rawSessionPresent: true, session: pair,
  firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c', baselineBound: false }) === 'baseline_missing_or_mismatched');

const coordinator = createWatcherMountCoordinator(); let listeners = 0;
await coordinator.activate(pair, async () => { listeners++; return () => { listeners--; }; });
check('9 first-install governed identity attaches without legacy session', listeners === 1 && coordinator.binding() === pair);

const initialHeld = deferred(); const values = []; let logoutCalls = 0; let watcherBaseline = 10;
const drain = createLatestValueDrain(async (value) => {
  values.push(value); if (value === 10) await initialHeld.promise;
  if (value > watcherBaseline) { watcherBaseline = value; logoutCalls++; }
});
drain.push(10); drain.push(20); initialHeld.resolve(); await new Promise((r) => setTimeout(r, 0));
check('10 newer Suite event arriving during initial processing logs out once', values.join(',') === '10,20' && logoutCalls === 1);
drain.push(20); drain.push(19); await new Promise((r) => setTimeout(r, 0));
check('equal and older watcher values do not manufacture another logout', logoutCalls === 1);
drain.stop(); drain.push(30); await new Promise((r) => setTimeout(r, 0));
check('watcher stop cancels pending delivery', logoutCalls === 1);

const delayed = deferred(); const c2 = createWatcherMountCoordinator(); let leaked = 0;
const mounting = c2.activate(pair, async () => { await delayed.promise; leaked++; return () => { leaked--; }; });
c2.dispose(); delayed.resolve(); await mounting;
check('11 unmount during asynchronous watcher startup leaves no listener', leaked === 0 && c2.binding() === null);

const aDelay = deferred(); const c3 = createWatcherMountCoordinator(); let active = [];
const aMount = c3.activate({ ...pair, uid: 'A' }, async () => { await aDelay.promise; active.push('A'); return () => { active = active.filter((x) => x !== 'A'); }; });
const bMount = c3.activate({ ...pair, uid: 'B' }, async () => { active.push('B'); return () => { active = active.filter((x) => x !== 'B'); }; });
await bMount; aDelay.resolve(); await aMount;
check('12 delayed Driver A cannot replace Driver B listener', active.join(',') === 'B' && c3.binding().uid === 'B');

const governedFailure = await runCompleteJsaLogout({
  clearFirebaseAuth: async () => true, clearLegacyDriverSession: async () => {},
  clearGovernedState: async () => { throw new Error('stored_session_remaining'); },
  clearCanonicalIdentityState: async () => {}, resetAuthContext: async () => {},
});
check('13 strict failure forbids navigation and requires retry state', !governedFailure.verified && !logoutTransitionAuthorized(governedFailure));
check('14 successful Settings logout restart is standalone', classifyGovernedStartup({ rawSessionPresent: false, session: null, firebaseUid: null, tokenDriverId: null, tokenCompanyId: null }) === 'standalone');

const hydration = parseCanonicalProfile({ driverId: 'd', companyId: 'c', displayName: 'Alias', legalName: null,
  signature: 'sig', companyName: 'Company', phone: 'phone', cdl: 'cdl', truckNumber: 'truck', trailerNumber: 'trailer' }, { driverId: 'd', companyId: 'c' });
check('15 canonical hydration exposes exact fields without display-name fallback', hydration?.legalName === null
  && hydration.signature === 'sig' && hydration.companyName === 'Company' && hydration.phone === 'phone'
  && hydration.cdl === 'cdl' && hydration.truckNumber === 'truck' && hydration.trailerNumber === 'trailer' && hydration.driverId === 'd');

const holder = { current: null }; const sigGate = deferred(); let callableCount = 0; let shown = 'old';
const save = () => runSignatureSaveSingleFlight(holder, () => saveGovernedSignatureAfterConfirmation('new', {
  persist: async () => { callableCount++; await sigGate.promise; }, commit: (v) => { shown = v; }, reportFailure: () => {},
}));
const s1 = save(); const s2 = save(); sigGate.resolve(); await Promise.all([s1, s2]);
check('16 governed signature same-tick double tap makes one callable', s1 === s2 && callableCount === 1 && shown === 'new');

const baselineA = serializeBoundLogoutBaseline({ ...pair, value: 50 });
check('17 baseline is bound and cannot cross drivers', parseBoundLogoutBaseline(baselineA, pair)?.value === 50
  && parseBoundLogoutBaseline(baselineA, { ...pair, driverId: 'other' }) === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
