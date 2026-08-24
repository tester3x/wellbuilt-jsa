import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeManualLoginAttempt } from '../services/sso/jsaManualLogin.ts';
import { retireLegacyAuthentication } from '../services/sso/jsaLegacyAuthRetirement.ts';
import { createGovernedIdentityMutationCoordinator } from '../services/sso/jsaIdentityMutationContract.ts';
import { cleanupOwnedIdentity } from '../services/sso/jsaOwnedIdentityCleanup.ts';
import { runSerializedUnauthenticatedRecovery } from '../services/sso/jsaSerializedRecovery.ts';
import { beginUnauthenticatedRecovery } from '../services/sso/jsaGovernedAuth.ts';
import { classifyGovernedHistoricalRecord, governedHistoricalQuery } from '../services/sso/jsaHistoricalLookupContract.ts';

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

{
  const values = new Map([['jsa_driverId', 'legacy'], ['jsa_driverName', 'legacy']]);
  let failDelete = true; let failRead = true;
  const store = {
    remove: async (key) => { if (failDelete && key === 'jsa_driverId') throw new Error('delete'); values.delete(key); },
    read: async (key) => { if (failRead && key === 'jsa_driverName') throw new Error('read'); return values.get(key) ?? null; },
  };
  const first = await retireLegacyAuthentication(store);
  failDelete = false; failRead = false;
  const retry = await retireLegacyAuthentication(store);
  check('retirement deletion/read-back failures stay failed and a retry succeeds',
    !first.retired && first.failures.includes('jsa_driverId:delete')
      && first.failures.includes('jsa_driverName:verify') && retry.retired);
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
const cleanupContract = read('services/sso/jsaOwnedIdentityCleanup.ts');
const login = read('components/LoginScreen.tsx');
const tabs = read('app/(tabs)/index.tsx');
const signoff = read('app/signoff.tsx');
check('no protected or readiness path calls legacy session restore or revalidation',
  !/getDriverSession|revalidateDriverSession|isDriverVerified|saveDriverSession/.test(ctx + driverAuth));
check('no canonical UUID is stored or presented as passcodeHash',
  !/passcodeHash\s*:\s*governed\.driverId|passcodeHash\s*:\s*session\.driverId/.test(ctx + live + driverAuth));
check('manual and rollback cleanup share the centralized full ownership preflight',
  live.includes('cleanupOwnedInstallationWithinMutation(owner)')
    && /session\.generation !== owner\.generation/.test(cleanupContract)
    && /session\.driverId !== owner\.driverId/.test(cleanupContract)
    && /session\.companyId !== owner\.companyId/.test(cleanupContract)
    && /baselineOwned\(owner\)/.test(cleanupContract));
check('independent registration is clearly unavailable and cannot submit',
  /Independent registration is temporarily unavailable/.test(login)
    && !/registerStandalone|handleStandaloneRegister/.test(ctx + login + driverAuth));

function ownedFixture(overrides = {}) {
  const owner = { generation: 'GA', uid: 'uA', driverId: 'dA', companyId: 'cA' };
  const state = { session: { ...owner, displayName: null, legalName: null,
    binding: { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true } },
    firebaseUid: 'uA', baseline: { ...owner }, mutations: [] };
  const deps = {
    loadSession: async () => state.session,
    currentFirebaseUid: () => state.firebaseUid,
    baselineOwned: async (candidate) => !!state.baseline && state.baseline.generation === candidate.generation,
    signOutFirebase: async () => { state.mutations.push('firebase'); state.firebaseUid = null; return true; },
    clearSessionGeneration: async (generation) => { state.mutations.push('session'); if (state.session?.generation === generation) state.session = null; },
    clearBaselineIfOwned: async (candidate) => { state.mutations.push('baseline'); if (state.baseline?.generation !== candidate.generation) return false; state.baseline = null; return true; },
    ...overrides,
  };
  return { owner, state, deps };
}

{
  const { owner, state, deps } = ownedFixture({ baselineOwned: async () => false });
  const result = await cleanupOwnedIdentity(owner, deps);
  check('real baseline mismatch prevents every destructive cleanup operation',
    !result.ok && !result.mutated && state.firebaseUid === 'uA' && state.session?.generation === 'GA'
      && state.baseline?.generation === 'GA' && state.mutations.length === 0);
}
{
  const { owner, state, deps } = ownedFixture({ baselineOwned: async () => { throw new Error('read'); } });
  const result = await cleanupOwnedIdentity(owner, deps);
  check('baseline read failure preserves Firebase session baseline and readiness state',
    !result.ok && !result.mutated && state.firebaseUid === 'uA' && !!state.session && !!state.baseline
      && state.mutations.length === 0);
}
{
  const fixture = ownedFixture();
  fixture.deps.signOutFirebase = async () => false;
  const result = await cleanupOwnedIdentity(fixture.owner, fixture.deps);
  check('Firebase sign-out failure leaves local session and baseline for retry',
    !result.ok && !result.mutated && !!fixture.state.session && !!fixture.state.baseline);
}
{
  const fixture = ownedFixture();
  fixture.deps.clearSessionGeneration = async () => { fixture.state.mutations.push('session'); throw new Error('delete'); };
  const result = await cleanupOwnedIdentity(fixture.owner, fixture.deps);
  check('governed-session deletion failure is partial but fail-closed with baseline retained',
    !result.ok && result.mutated && fixture.state.firebaseUid === null
      && fixture.state.session?.generation === 'GA' && fixture.state.baseline?.generation === 'GA');
}
{
  const fixture = ownedFixture();
  fixture.deps.clearBaselineIfOwned = async () => { fixture.state.mutations.push('baseline'); throw new Error('delete'); };
  const result = await cleanupOwnedIdentity(fixture.owner, fixture.deps);
  check('baseline deletion failure is partial fail-closed and cannot publish readiness',
    !result.ok && result.mutated && fixture.state.firebaseUid === null
      && fixture.state.session === null && fixture.state.baseline?.generation === 'GA');
}
{
  const fixture = ownedFixture();
  fixture.state.session = { ...fixture.state.session, generation: 'GB', uid: 'uB', driverId: 'dB', companyId: 'cB' };
  fixture.state.firebaseUid = 'uB'; fixture.state.baseline = { generation: 'GB' };
  const result = await cleanupOwnedIdentity(fixture.owner, fixture.deps);
  check('stale Manual A cannot clean newer Manual or Suite B',
    !result.ok && !result.mutated && fixture.state.session.generation === 'GB' && fixture.state.firebaseUid === 'uB');
}

for (const contender of ['manual_login', 'suite_sso', 'logout']) {
  const lane = createGovernedIdentityMutationCoordinator();
  const state = { session: 'A', auth: 'A', published: [] };
  let release; const held = new Promise((resolve) => { release = resolve; });
  const recovery = runSerializedUnauthenticatedRecovery(lane, async (current) => {
    return beginUnauthenticatedRecovery({
      nowMs: () => 100,
      loadLatch: async () => { await held; return null; },
      saveLatch: async () => {},
      loadAttempt: async () => ({ state: 'state-a', createdAtMs: 1, consumed: false }),
      mintAttempt: async () => ({ state: 'state-a', createdAtMs: 1, consumed: false }),
      usedGeneration: 'GA',
      currentGeneration: async () => state.session === 'A' ? 'GA' : 'GB',
      clearIfGeneration: async () => { if (current()) state.session = null; },
      reconcileAuth: async () => { if (current()) state.auth = null; },
    });
  });
  await Promise.resolve();
  const epochB = lane.reserve();
  const newer = lane.run(async () => {
    if (lane.isCurrent(epochB)) { state.session = 'B'; state.auth = 'B'; state.published.push(contender); }
  });
  release();
  const outcome = await recovery; await newer;
  check(`serialized recovery cannot clear or publish over newer ${contender}`,
    outcome === 'fail_closed' && state.session === 'B' && state.auth === 'B'
      && state.published.join(',') === contender);
}

{
  const identity = { uid: 'u', driverId: 'canonical-driver', companyId: 'company' };
  const query = governedHistoricalQuery(identity);
  check('canonical governed history queries the non-credential driverId field',
    query?.field === 'driverId' && query.value === identity.driverId);
  check('canonical records remain discoverable and pre-cutover hash-only records require backend support',
    classifyGovernedHistoricalRecord({ driverId: 'canonical-driver', companyId: 'company' }, identity) === 'canonical_match'
      && classifyGovernedHistoricalRecord({ driverHash: 'legacy-credential-hash' }, identity) === 'backend_required'
      && classifyGovernedHistoricalRecord({ driverId: 'other', companyId: 'company' }, identity) === 'foreign');
  const historyQuery = tabs.slice(tabs.indexOf("from: [{ collectionId: 'jsas' }]"));
  check('production JSA history read and write use canonical driverId without credential fallback',
    historyQuery.includes('historicalIdentity.field')
      && signoff.includes('driverId: { stringValue: driverHash }')
      && !/passcodeHash/.test(historyQuery));
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
