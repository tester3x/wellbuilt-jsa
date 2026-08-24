import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeManualLoginAttempt } from '../services/sso/jsaManualLogin.ts';
import { retireLegacyAuthentication } from '../services/sso/jsaLegacyAuthRetirement.ts';
import { createGovernedIdentityMutationCoordinator } from '../services/sso/jsaIdentityMutationContract.ts';
import { cleanupOwnedIdentity } from '../services/sso/jsaOwnedIdentityCleanup.ts';
import { runSerializedUnauthenticatedRecovery } from '../services/sso/jsaSerializedRecovery.ts';
import { classifyGovernedHistoricalRecord, governedHistoricalQuery } from '../services/sso/jsaHistoricalLookupContract.ts';
import { lookupGovernedShiftHistory } from '../services/sso/jsaGovernedHistoryLookup.ts';
import { strictClearRawSessionIfGeneration } from '../services/sso/jsaStrictSessionCleanup.ts';
import { attachRetryGenerationForCurrentOwner, beginUnauthenticatedRecovery, consumeRecoveryLatchForCurrentOwner, createSerializedLatchMutator, installGovernedAuthSession, resetGovernedAuthRecoveryForTests } from '../services/sso/jsaGovernedAuth.ts';
import { classifyGovernedStartup, strictStartupPresentation } from '../services/sso/jsaIdentityStartupContract.ts';
import { createGuardedCompleteLogoutOps, runCompleteJsaLogout } from '../services/sso/jsaLogoutContract.ts';
import { requireStrictClear, strictClearAndVerify } from '../services/sso/jsaStrictLogoutStorage.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const runtimeSrc = read('services/sso/jsaRuntime.ts');
const liveAuthSrc = read('services/sso/jsaGovernedAuthLive.ts');
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
const historyLive = read('services/sso/jsaGovernedHistoryLookupLive.ts');
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
  check('production JSA history read and write use canonical driverId without credential fallback',
    historyLive.includes("fieldPath: 'driverId'")
      && signoff.includes('driverId: { stringValue: driverHash }')
      && !/passcodeHash/.test(historyLive));
}

const exactHistorySession = { uid: 'u', driverId: 'd', companyId: 'c', generation: 'g',
  displayName: null, legalName: null,
  binding: { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true } };
const historyTransport = (overrides = {}) => ({
  inspectIdentity: async () => ({ state: 'usable', session: exactHistorySession, firebaseUid: 'u' }),
  freshIdToken: async () => 'fresh-id-token',
  runQuery: async () => [{ document: { fields: {
    driverId: { stringValue: 'd' }, companyId: { stringValue: 'c' },
    shiftId: { stringValue: '2026-08-23_010203' },
  } } }],
  ...overrides,
});
check('API-key-only governed history access is prohibited by the live adapter',
  historyLive.includes('Authorization: `Bearer ${token}`') && !historyLive.includes('?key='));
check('authenticated canonical history returns found',
  (await lookupGovernedShiftHistory('2026-08-23_010203', historyTransport())).kind === 'found');
check('canonical empty result cannot become authoritative-none before server contract',
  (await lookupGovernedShiftHistory('2026-08-23_010203', historyTransport({
    runQuery: async () => [],
  }))).kind === 'backend_required');
check('empty live canonical scope is backend-required without legacy completeness proof',
  (await lookupGovernedShiftHistory('2026-08-23_010203', historyTransport({ runQuery: async () => [] }))).kind === 'backend_required');
for (const [name, override, expected] of [
  ['denial', { runQuery: async () => { const e = new Error('denied'); e.status = 403; throw e; } }, 'denied'],
  ['offline', { runQuery: async () => { throw new Error('network'); } }, 'network'],
  ['malformed', { runQuery: async () => ({ nope: true }) }, 'malformed'],
]) {
  const result = await lookupGovernedShiftHistory('2026-08-23_010203', historyTransport(override));
  check(`authenticated history ${name} remains unavailable`, result.kind === 'unavailable' && result.reason === expected);
}
check('production UI blocks duplicate form for checking unavailable and backend-required lookup states',
  tabs.includes('historyBlocksNewJsa') && tabs.includes("historyLookup === 'backend_required'")
    && tabs.includes('!historyBlocksNewJsa && isSsoMode'));
check('same-device local history is also bound to canonical driver company and shift',
  tabs.includes('s?.driverId === owner?.driverId')
    && tabs.includes('s?.companyId === owner?.companyId'));

for (const scenario of ['delete_error', 'readback_error', 'false_generation']) {
  let raw = JSON.stringify({ generation: scenario === 'false_generation' ? 'GB' : 'GA' });
  let reads = 0;
  const storage = {
    readRaw: async () => { reads++; if (scenario === 'readback_error' && reads > 1) throw new Error('read'); return raw; },
    deleteRaw: async () => { if (scenario === 'delete_error') throw new Error('delete'); raw = null; },
  };
  let outcome = 'throw';
  try { outcome = String(await strictClearRawSessionIfGeneration('GA', storage, (value) => JSON.parse(value).generation)); }
  catch { outcome = 'throw'; }
  check(`strict session cleanup ${scenario} cannot verify absence`,
    scenario === 'false_generation' ? outcome === 'false' && raw !== null : outcome === 'throw');
}

{
  const secure = new Map();
  const state = { authUid: null, readiness: 0, context: true };
  const sessionStore = {
    read: async (key) => secure.get(key) ?? null,
    remove: async (key) => { secure.delete(key); },
  };
  const loadSession = async () => {
    const raw = secure.get('jsa_governed_session');
    return raw ? JSON.parse(raw) : null;
  };
  const cleanupOwner = async (owner) => cleanupOwnedIdentity(owner, {
    loadSession,
    currentFirebaseUid: () => state.authUid,
    baselineOwned: async (expected) => {
      const raw = secure.get('jsa_lastCanonicalLogoutAt');
      return !!raw && JSON.parse(raw).generation === expected.generation;
    },
    signOutFirebase: async () => { state.authUid = null; return true; },
    clearSessionGeneration: async (generation) => {
      const current = await loadSession();
      if (current?.generation !== generation) throw new Error('session_changed');
      requireStrictClear(await strictClearAndVerify([{ store: sessionStore, keys: ['jsa_governed_session'] }]));
    },
    clearBaselineIfOwned: async (expected) => {
      const raw = secure.get('jsa_lastCanonicalLogoutAt');
      if (!raw || JSON.parse(raw).generation !== expected.generation) return false;
      requireStrictClear(await strictClearAndVerify([{ store: sessionStore, keys: ['jsa_lastCanonicalLogoutAt'] }]));
      return true;
    },
  });
  const first = await installGovernedAuthSession({
    payload, legalName: null, generation: 'GA',
    signInWithCustomToken: async () => { state.authUid = 'uA'; return { uid: 'uA' }; },
    persist: async (session) => {
      secure.set('jsa_governed_session', JSON.stringify(session));
      throw new Error('baseline_seed_failed');
    },
    reconcileAuth: async () => {},
    clearIfGeneration: async () => { await cleanupOwner({ generation: 'GA', uid: 'uA', driverId: 'dA', companyId: 'cA' }); },
  });
  const partialSession = await loadSession();
  const startup = strictStartupPresentation(classifyGovernedStartup({
    rawSessionPresent: !!partialSession, session: partialSession, firebaseUid: state.authUid,
    tokenDriverId: 'dA', tokenCompanyId: 'cA', baselineBound: false,
  }));
  check('partial install remains protected and never publishes readiness',
    !first.ok && state.authUid === 'uA' && partialSession?.generation === 'GA'
      && state.readiness === 0 && startup.protectedContentBlocked && !startup.governedReady);

  const logout = await runCompleteJsaLogout(createGuardedCompleteLogoutOps({
    clearFirebaseAuth: async () => { state.authUid = null; return state.authUid === null; },
    clearLegacyDriverSession: async () => {},
    clearGovernedState: async () => {
      requireStrictClear(await strictClearAndVerify([{ store: sessionStore, keys: ['jsa_governed_session'] }]));
    },
    resetAuthContext: async () => { state.context = false; },
    clearCanonicalIdentityState: async () => {
      requireStrictClear(await strictClearAndVerify([{ store: sessionStore, keys: ['jsa_lastCanonicalLogoutAt'] }]));
    },
  }));
  check('real verified full logout clears partial Firebase session baseline and context',
    logout.verified && state.authUid === null && await loadSession() === null
      && !secure.has('jsa_lastCanonicalLogoutAt') && state.context === false && logout.failures.length === 0);

  const retryPayload = { ...payload, uid: 'uB', driverId: 'dB', companyId: 'cB' };
  const retry = await installGovernedAuthSession({
    payload: retryPayload, legalName: null, generation: 'GB',
    signInWithCustomToken: async () => { state.authUid = 'uB'; return { uid: 'uB' }; },
    persist: async (session) => {
      secure.set('jsa_governed_session', JSON.stringify(session));
      secure.set('jsa_lastCanonicalLogoutAt', JSON.stringify({ generation: 'GB' }));
      state.readiness++;
    },
  });
  const delayedA = await cleanupOwner({ generation: 'GA', uid: 'uA', driverId: 'dA', companyId: 'cA' });
  const retrySession = await loadSession();
  check('later exact retry installs and delayed failed-install cleanup cannot remove it',
    retry.ok && state.readiness === 1 && !delayedA.ok && !delayedA.mutated
      && state.authUid === 'uB' && retrySession?.generation === 'GB'
      && secure.has('jsa_lastCanonicalLogoutAt'));
}

{
  resetGovernedAuthRecoveryForTests();
  let current = true; let minted = 0; let latchWrites = 0; let release;
  const held = new Promise((resolve) => { release = resolve; });
  const recovery = beginUnauthenticatedRecovery({
    nowMs: () => 100, loadLatch: async () => null, saveLatch: async () => { latchWrites++; },
    loadAttempt: async () => { await held; return null; },
    mintAttempt: async () => { minted++; return { state: 's', createdAtMs: 1, consumed: false }; },
    usedGeneration: 'GA', currentGeneration: async () => 'GA', clearIfGeneration: async () => {},
    reconcileAuth: async () => {}, stillCurrent: () => current, recoveryOwnerKey: 'owner-A',
  });
  await Promise.resolve(); current = false; release();
  check('stale recovery cannot mint attempt or persist latch after losing epoch',
    await recovery === 'fail_closed' && minted === 0 && latchWrites === 0);
}

check('live recovery persistence checks ownership at each storage mutation',
  /if \(!stillCurrent\(\)\) throw new Error\('superseded'\);\s*await SecureStore\.setItemAsync\(VERIFIER_KEY/.test(runtimeSrc)
  && /await SecureStore\.setItemAsync\(VERIFIER_KEY, attempt\.verifier\);\s*if \(!stillCurrent\(\)\) throw new Error\('superseded'\);\s*await AsyncStorage\.setItem/.test(runtimeSrc)
  && /saveLatch: async \(latch: AuthRecoveryLatch\) => \{\s*if \(!current\(\)\) throw new Error\('superseded'\);/.test(liveAuthSrc)
  && /stillCurrent: current,/.test(liveAuthSrc));

{
  let current = true; let releaseAttempt;
  const heldAttempt = new Promise((resolve) => { releaseAttempt = resolve; });
  let attached = 0;
  const flight = attachRetryGenerationForCurrentOwner({
    stillCurrent: () => current,
    loadAttempt: async () => heldAttempt,
    generation: 'GB',
    attach: async () => { attached++; return true; },
  });
  current = false;
  releaseAttempt({ state: 'attempt-A', createdAtMs: 1, consumed: false });
  check('supersede immediately before post-install latch attachment prevents mutation',
    await flight === false && attached === 0);
}

{
  let current = true; let releaseLoad;
  const heldLoad = new Promise((resolve) => { releaseLoad = resolve; });
  const state = {
    latch: { state: 'newer-B', createdAtMs: 2, usedAtMs: 2, phase: 'recovering', failedGeneration: 'GB', retryGeneration: null },
    session: 'GB', firebase: 'uB', writes: 0,
  };
  const mutator = createSerializedLatchMutator({
    load: async () => { await heldLoad; return state.latch; },
    save: async (value) => { state.latch = value; state.writes++; },
    clear: async () => { state.latch = null; state.writes++; },
  });
  const queued = attachRetryGenerationForCurrentOwner({
    stillCurrent: () => current,
    loadAttempt: async () => ({ state: 'newer-B', createdAtMs: 2, consumed: false }),
    generation: 'GB',
    attach: (expected, generation, ownerCurrent) =>
      mutator.attachRetryGeneration(expected, generation, ownerCurrent),
  });
  current = false; releaseLoad();
  check('supersede while latch write is queued preserves newer owner state',
    await queued === false && state.writes === 0 && state.latch.state === 'newer-B'
      && state.session === 'GB' && state.firebase === 'uB');
}

{
  let current = true; let releaseLoad;
  const heldLoad = new Promise((resolve) => { releaseLoad = resolve; });
  const state = {
    latch: { state: 'newer-B', createdAtMs: 2, usedAtMs: 2, phase: 'recovering', failedGeneration: 'GA', retryGeneration: 'GB' },
    session: 'GB', firebase: 'uB', clears: 0,
  };
  const mutator = createSerializedLatchMutator({
    load: async () => { await heldLoad; return state.latch; },
    save: async (value) => { state.latch = value; },
    clear: async () => { state.latch = null; state.clears++; },
  });
  const consume = consumeRecoveryLatchForCurrentOwner({
    stillCurrent: () => current,
    loadAttempt: async () => ({ state: 'newer-B', createdAtMs: 2, consumed: false }),
    sessionGeneration: 'GB', nowMs: () => 2,
    consume: (input, ownerCurrent) => mutator.consumeIfMatching(input, ownerCurrent),
  });
  current = false; releaseLoad();
  check('supersede before latch consumption preserves newer attempt latch session and Firebase identity',
    await consume === false && state.clears === 0 && state.latch.state === 'newer-B'
      && state.session === 'GB' && state.firebase === 'uB');
}

{
  resetGovernedAuthRecoveryForTests();
  let releaseA;
  const heldA = new Promise((resolve) => { releaseA = resolve; });
  const deps = (owner, held) => ({
    nowMs: () => 1, loadLatch: async () => null, saveLatch: async () => {},
    loadAttempt: async () => { if (held) await held; return null; },
    mintAttempt: async () => ({ state: owner, createdAtMs: 1, consumed: false }),
    usedGeneration: null, clearIfGeneration: async () => {}, reconcileAuth: async () => {},
    recoveryOwnerKey: owner,
  });
  const first = beginUnauthenticatedRecovery(deps('no-session:epoch-A', heldA));
  await Promise.resolve();
  const second = await beginUnauthenticatedRecovery(deps('no-session:epoch-B', null));
  releaseA(); await first;
  check('no-session recovery flights from different identity epochs never share ownership', second === 'fail_closed');
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
