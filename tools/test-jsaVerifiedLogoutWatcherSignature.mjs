import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSingleFlightLogout,
  logoutTransitionAuthorized,
  runCompleteJsaLogout,
} from '../services/sso/jsaLogoutContract.ts';
import {
  boundLogoutSignalAdvanced,
  safeLogoutSignalRead,
} from '../services/sso/jsaLogoutWatcherContract.ts';
import { saveGovernedSignatureAfterConfirmation } from '../services/sso/jsaSignatureSaveContract.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let pass = 0; let fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } }
function ops(firebase, order, state) {
  return {
    clearFirebaseAuth: async () => { order.push('firebase'); return firebase(); },
    clearLegacyDriverSession: async () => { order.push('local'); state.local = false; },
    clearGovernedState: async () => { order.push('governed'); state.governed = false; },
    clearCanonicalIdentityState: async () => { order.push('canonical'); state.canonical = false; },
    resetAuthContext: async () => { order.push('context'); state.context = false; },
  };
}

let order = []; let state = { local: true, governed: true, canonical: true, context: true };
let result = await runCompleteJsaLogout(ops(async () => true, order, state));
check('1 verified Firebase sign-out returns structured success after all cleanup', result.verified
  && result.firebaseAuthCleared && result.localIdentityCleared && result.governedStateCleared
  && result.canonicalBaselineCleared && result.reactContextReset && result.failures.length === 0);

order = []; state = { local: true, governed: true, canonical: true, context: true };
result = await runCompleteJsaLogout(ops(async () => { throw new Error('signout_rejected'); }, order, state));
check('2 Firebase reject still attempts every cleanup and forbids transition', !result.verified
  && order.join(',') === 'firebase,local,governed,context,canonical' && !logoutTransitionAuthorized(result));

order = []; state = { local: true, governed: true, canonical: true, context: true };
result = await runCompleteJsaLogout(ops(async () => false, order, state));
check('3 currentUser remaining after settlement is verification failure', !result.firebaseAuthCleared
  && result.failures.some((f) => f.operation === 'firebaseAuth' && f.message === 'verification_failed'));

let attempt = 0;
const retry = async () => runCompleteJsaLogout(ops(async () => ++attempt > 1, [], { local: true, governed: true, canonical: true, context: true }));
check('4 second attempt succeeds after first failure', !(await retry()).verified && (await retry()).verified);

let runs = 0;
const single = createSingleFlightLogout(async () => { runs++; await Promise.resolve(); return { run: runs }; });
const a = single(); const b = single(); const [ar, br] = await Promise.all([a, b]);
check('5 concurrent callers share one operation and result', a === b && ar === br && runs === 1);

order = []; state = { local: true, governed: true, canonical: true, context: true };
result = await runCompleteJsaLogout({ ...ops(async () => true, order, state), clearLegacyDriverSession: async () => { order.push('local'); throw new Error('corrupt_key'); } });
check('6 corrupt local key preserves verified Firebase sign-out and remaining attempts', result.firebaseAuthCleared
  && !result.verified && order.join(',') === 'firebase,local,governed,context,canonical');

const durable = { saves: ['history'], artifacts: ['recovery'], vehicle: 'A', contact: 'A' };
await runCompleteJsaLogout({
  clearFirebaseAuth: async () => true,
  clearLegacyDriverSession: async () => { durable.vehicle = ''; durable.contact = ''; },
  clearGovernedState: async () => {}, clearCanonicalIdentityState: async () => {}, resetAuthContext: async () => {},
});
check('7 saves and artifact recovery survive cleanup', durable.saves[0] === 'history' && durable.artifacts[0] === 'recovery');
check('8 Driver A vehicle/contact cache clears before Driver B', !durable.vehicle && !durable.contact);

const A = { uid: 'uid-a', driverId: 'driver-a', companyId: 'company-a' };
check('10 watcher network failure is caught and does not logout', await safeLogoutSignalRead(async () => { throw new Error('offline'); }) === false);
check('12 another UID/driver/company signal is ignored', !boundLogoutSignalAdvanced(A,
  { uid: 'uid-b', driverId: 'driver-a', companyId: 'company-a' }, 10, 20));

let shown = 'old'; let failed = false; const signatureOrder = [];
const saved = await saveGovernedSignatureAfterConfirmation('new', {
  persist: async () => { signatureOrder.push('persist'); },
  commit: (v) => { signatureOrder.push('commit'); shown = v; }, reportFailure: () => { failed = true; },
});
check('13 governed signature commits only after confirmation', saved && shown === 'new' && signatureOrder.join(',') === 'persist,commit');
shown = 'old'; failed = false;
const notSaved = await saveGovernedSignatureAfterConfirmation('new', {
  persist: async () => { throw new Error('denied'); }, commit: (v) => { shown = v; }, reportFailure: () => { failed = true; },
});
check('14 governed signature failure preserves prior display and reports failure', !notSaved && shown === 'old' && failed);

const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
const watcher = readFileSync(join(root, 'services/sso/jsaLogoutWatcherLive.ts'), 'utf8');
const settings = readFileSync(join(root, 'app/settings.tsx'), 'utf8');
check('9 watcher never polls full hydration every three seconds', !watcher.includes('getOwnDriverHydration')
  && !layout.includes('3_000') && layout.includes('startGovernedLogoutWatcher'));
check('11 foreground resume performs immediate bound read', layout.includes('checkGovernedLogoutSignalOnce'));
check('15 governed profile/signature has no direct legacy RTDB write',
  !/drivers\/approved|method:\s*['"]PATCH['"]|FIREBASE_DB/.test(settings));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
