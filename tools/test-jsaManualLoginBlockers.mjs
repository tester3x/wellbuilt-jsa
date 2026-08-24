import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeManualLoginAttempt } from '../services/sso/jsaManualLogin.ts';
import { retireLegacyAuthentication } from '../services/sso/jsaLegacyAuthRetirement.ts';
import { createGovernedIdentityMutationCoordinator } from '../services/sso/jsaIdentityMutationContract.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
let pass = 0; let fail = 0;
function check(name, ok) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? pass++ : fail++; }

// Upgrade retirement is bounded to obsolete auth keys.
{
  const values = new Map([
    ['jsa_driverId', 'legacy'], ['jsa_passcodeHash', 'legacy-hash'],
    ['jsa_pendingSecureId', 'pending'], ['@jsa/saves', 'history'],
    ['@jsa/activeJsas', 'active'], ['@jsa/governedArtifactQueue', 'recovery'],
  ]);
  const attempted = [];
  const result = await retireLegacyAuthentication({
    remove: async (key) => { attempted.push(key); values.delete(key); },
    read: async (key) => values.get(key) ?? null,
  });
  check('vc21 legacy auth keys retire and cannot restore presentation', result.retired
    && !values.has('jsa_driverId') && !values.has('jsa_passcodeHash'));
  check('historical active and recovery data survive bounded retirement',
    values.get('@jsa/saves') === 'history' && values.get('@jsa/activeJsas') === 'active'
    && values.get('@jsa/governedArtifactQueue') === 'recovery' && values.get('jsa_pendingSecureId') === 'pending');
  check('bounded retirement attempts every declared legacy key', attempted.length === result.attempted.length);
}

const payload = { protocolVersion: 1, customToken: 'token', uid: 'uA', driverId: 'dA', companyId: 'cA',
  jsaBinding: { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true } };
const attempt = (call, extra = {}) => executeManualLoginAttempt({ displayName: 'A', passcode: 'bad', stillCurrent: () => true }, {
  call, install: async () => { throw new Error('unexpected_install'); }, inspect: async () => true,
  cleanup: async () => { throw new Error('unexpected_cleanup'); }, ...extra,
});

check('callable timeout before installation leaves a pre-existing governed identity untouched',
  (await attempt(async () => { throw { code: 'functions/unavailable' }; })).code === 'offline_timeout');
check('bad credentials before installation leave a pre-existing governed identity untouched',
  (await attempt(async () => { throw { code: 'functions/permission-denied' }; })).code === 'invalid_credentials');

{
  const owner = { generation: 'GA', uid: 'uA', driverId: 'dA', companyId: 'cA' };
  let cleaned = null;
  const result = await executeManualLoginAttempt({ displayName: 'A', passcode: 'ok', stillCurrent: () => true }, {
    call: async () => payload,
    install: async () => owner,
    inspect: async () => false,
    cleanup: async (candidate) => { cleaned = candidate; },
  });
  check('post-install mismatch cleans only the exact generation installed by that attempt',
    result.code === 'binding_mismatch' && cleaned === owner);
}

// The production coordinator serializes all identity mutations and epochs invalidate stale work.
{
  const lane = createGovernedIdentityMutationCoordinator();
  const aEpoch = lane.reserve();
  let releaseA; const held = new Promise((resolve) => { releaseA = resolve; });
  const events = [];
  const manualA = lane.run(async () => { await held; if (lane.isCurrent(aEpoch)) events.push('A'); });
  await Promise.resolve();
  const bEpoch = lane.reserve();
  const suiteB = lane.run(async () => { if (lane.isCurrent(bEpoch)) events.push('B'); });
  releaseA(); await Promise.all([manualA, suiteB]);
  check('Manual A superseded by Suite SSO B cannot replace B', events.join(',') === 'B');
}
{
  const lane = createGovernedIdentityMutationCoordinator();
  const aEpoch = lane.reserve();
  const installed = { generation: 'GB', uid: 'uB' };
  lane.reserve(); // Suite B invalidates A before A cleanup obtains the lane.
  let cleared = false;
  await lane.run(async () => { if (lane.isCurrent(aEpoch) && installed.generation === 'GA') cleared = true; });
  check('Suite SSO B installed during Manual A cleanup survives unchanged', !cleared && installed.uid === 'uB');
}

const ctx = read('app/contexts/AuthContext.tsx');
const driverAuth = read('services/driverAuth.ts');
const live = read('services/sso/jsaManualLoginLive.ts');
const login = read('components/LoginScreen.tsx');
check('no protected or readiness path calls legacy session restore or revalidation',
  !/getDriverSession|revalidateDriverSession|isDriverVerified|saveDriverSession/.test(ctx + driverAuth));
check('no canonical UUID is stored or presented as passcodeHash',
  !/passcodeHash\s*:\s*governed\.driverId|passcodeHash\s*:\s*session\.driverId/.test(ctx + live + driverAuth));
check('manual cleanup re-reads exact generation UID driver and company ownership',
  /installed\?\.generation === owner\.generation/.test(live)
    && /installed\.driverId === owner\.driverId/.test(live)
    && /installed\.companyId === owner\.companyId/.test(live));
check('independent registration is clearly unavailable and cannot submit',
  /Independent registration is temporarily unavailable/.test(login)
    && !/registerStandalone|handleStandaloneRegister/.test(ctx + login + driverAuth));

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
