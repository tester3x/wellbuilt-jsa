import {
  attachRetryGenerationForCurrentOwner,
  consumeRecoveryLatchForCurrentOwner,
  createSerializedLatchMutator,
  finalizeGovernedInstallation,
  finalizeInstalledIdentityOrCleanup,
} from '../services/sso/jsaGovernedAuth.ts';
import { createShiftRefreshCoordinator } from '../services/sso/jsaShiftRefreshOwnership.ts';
import { classifyGovernedStartup, strictStartupPresentation } from '../services/sso/jsaIdentityStartupContract.ts';
import { strictClearRawSessionIfGeneration } from '../services/sso/jsaStrictSessionCleanup.ts';
import { runStrictRecoverySessionCleanup } from '../services/sso/jsaStrictRecoveryCleanup.ts';
import { obtainAuthoritativeContext } from '../services/sso/jsaRequestLifecycle.ts';
import { cleanupOwnedIdentity } from '../services/sso/jsaOwnedIdentityCleanup.ts';

let passed = 0; let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? passed++ : failed++; };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const latch = (overrides = {}) => ({
  state: 'attempt-A', createdAtMs: 1, usedAtMs: 2, phase: 'recovering',
  failedGeneration: 'GA', retryGeneration: null, ...overrides,
});

const shiftOwner = (generation, epoch, overrides = {}) => ({
  identityEpoch: epoch, sessionGeneration: generation, uid: 'uA', driverId: 'dA', companyId: 'cA',
  expectedShiftId: 'shift-old', ...overrides,
});

// The production coordinator coalesces the real home-screen fan-out for one exact owner.
{
  const coordinator = createShiftRefreshCoordinator(); const held = deferred();
  const owner = shiftOwner('GA', 1); let epoch = 1; let networkStarts = 0; let durableCommits = 0;
  const operation = async (commit) => {
    networkStarts++; await held.promise;
    return commit(async () => { durableCommits++; return 'shift-A'; });
  };
  const day = coordinator.run(owner, () => epoch === 1, operation);
  const hydration = coordinator.run(owner, () => epoch === 1, operation);
  const history = coordinator.run(owner, () => epoch === 1, operation);
  held.resolve(); const results = await Promise.all([day, hydration, history]);
  const ui = { day: false, hydrationDone: false, history: 'checking' };
  if (results[0].kind === 'applied') ui.day = true;
  if (results[1].kind === 'applied') ui.hydrationDone = true;
  if (results[2].kind === 'applied') ui.history = 'found';
  check('mount/focus day-status hydration and history share one exact-owner authoritative refresh',
    networkStarts === 1 && durableCommits === 1 && results.every((r) => r.kind === 'applied'));
  check('coalesced history leaves checking and hydration completes only from applied owner',
    ui.day && ui.hydrationDone && ui.history === 'found');
}

const installedOwner = { generation: 'GI', uid: 'uid-I', driverId: 'driver-I', companyId: 'company-I' };
const installedState = () => ({
  firebaseUid: installedOwner.uid,
  session: { ...installedOwner, audience: 'wellbuilt-jsa' },
  baseline: { ...installedOwner },
  marker: null,
  ready: 0,
});
const cleanupDeps = (state, failure = null) => ({
  loadSession: async () => state.session,
  currentFirebaseUid: () => state.firebaseUid,
  baselineOwned: async (owner) => !!state.baseline
    && ['generation', 'uid', 'driverId', 'companyId'].every((key) => state.baseline[key] === owner[key]),
  signOutFirebase: async () => {
    if (failure === 'firebase') throw new Error('firebase');
    state.firebaseUid = null; return true;
  },
  clearSessionGeneration: async (generation) => {
    if (failure === 'session') throw new Error('session');
    if (state.session?.generation === generation) state.session = null;
  },
  clearBaselineIfOwned: async () => {
    if (failure === 'baseline') throw new Error('baseline');
    state.baseline = null; return true;
  },
  clearFinalizedMarkerIfOwned: async () => { state.marker = null; return true; },
});

// This is the same finalization/cleanup orchestration called by persistAfterExchange for
// both manual login and the SSO callback. A post-install mismatch cannot survive restart.
for (const [name, finalization] of [
  ['active latch mismatch', 'active_latch_mismatch'],
  ['latch storage failure', 'storage_failure'],
  ['owner supersession', 'owner_superseded'],
]) {
  const state = installedState();
  const result = await finalizeInstalledIdentityOrCleanup({
    finalize: async () => finalization,
    persistFailureMarker: async () => { state.marker = { status: 'failed', ...installedOwner }; },
    cleanupExactInstallation: () => cleanupOwnedIdentity(installedOwner, cleanupDeps(state)),
  });
  const startup = classifyGovernedStartup({
    rawSessionPresent: !!state.session,
    firebaseUid: state.firebaseUid,
    session: state.session,
    authority: null,
    installationMarkerState: state.marker?.status ?? 'missing',
  });
  check(`post-install ${name} performs exact cleanup and is not restart-usable`,
    !result.ok && result.cleanup === 'complete' && !state.firebaseUid && !state.session
      && !state.baseline && strictStartupPresentation(startup).governedReady === false);
}

{
  const state = installedState();
  const result = await finalizeInstalledIdentityOrCleanup({
    finalize: async () => { throw new Error('latch-read'); },
    persistFailureMarker: async () => { state.marker = { status: 'failed', ...installedOwner }; },
    cleanupExactInstallation: () => cleanupOwnedIdentity(installedOwner, cleanupDeps(state, 'firebase')),
  });
  const startup = classifyGovernedStartup({
    rawSessionPresent: true,
    firebaseUid: state.firebaseUid,
    session: state.session,
    tokenDriverId: installedOwner.driverId,
    tokenCompanyId: installedOwner.companyId,
    baselineBound: true,
    installationFinalized: false,
    installationMarkerState: 'failed',
  });
  check('finalization exception plus cleanup failure remains protected and retryable',
    !result.ok && result.cleanup === 'firebase_signout_failed' && state.firebaseUid === installedOwner.uid
      && state.session?.generation === installedOwner.generation && state.baseline
      && startup === 'installation_not_finalized' && strictStartupPresentation(startup).governedReady === false);
}

{
  const state = installedState(); let ready = 0; const heldAttach = deferred(); let current = true;
  const running = finalizeInstalledIdentityOrCleanup({
    finalize: () => finalizeGovernedInstallation({
      stillCurrent: () => current,
      attachRecovery: async () => heldAttach.promise,
      verifyExactIdentity: async () => true,
      persistFinalizedMarker: async () => { state.marker = { status: 'finalized', ...installedOwner }; },
      publishReady: () => { ready++; },
    }),
    persistFailureMarker: async () => { state.marker = { status: 'failed', ...installedOwner }; },
    cleanupExactInstallation: () => cleanupOwnedIdentity(installedOwner, cleanupDeps(state)),
  });
  current = false; heldAttach.resolve('applied');
  const result = await running;
  check('deferred latch supersession publishes no readiness and cleans the exact installation',
    !result.ok && result.finalization === 'owner_superseded' && result.cleanup === 'complete'
      && ready === 0 && !state.firebaseUid && !state.session && !state.baseline);
}

// Different owner gets a distinct flight; durable commit lane orders A before B.
{
  const coordinator = createShiftRefreshCoordinator(); let epoch = 1; let starts = 0; const state = { shift: null };
  const heldNetworkA = deferred(); const heldWriteA = deferred();
  const ownerA = shiftOwner('GA', 1);
  const flightA = coordinator.run(ownerA, () => epoch === 1, async (commit) => {
    starts++; await heldNetworkA.promise;
    return commit(async () => { await heldWriteA.promise; state.shift = 'shift-A'; return 'shift-A'; });
  });
  epoch = 2;
  const ownerB = shiftOwner('GB', 2, { uid: 'uB', driverId: 'dB', companyId: 'cB', expectedShiftId: null });
  const flightB = coordinator.run(ownerB, () => epoch === 2, async (commit) => {
    starts++; return commit(async () => { state.shift = 'shift-B'; return 'shift-B'; });
  });
  heldNetworkA.resolve(); await Promise.resolve(); heldWriteA.resolve();
  const [a, b] = await Promise.all([flightA, flightB]);
  check('Driver B starts a distinct flight and deferred Driver A storage cannot settle over B',
    starts === 2 && a.kind === 'superseded' && b.kind === 'applied' && state.shift === 'shift-B');
}

{
  const coordinator = createShiftRefreshCoordinator(); let epoch = 1; let writes = 0; const held = deferred();
  const a = coordinator.run(shiftOwner('GA', 1), () => epoch === 1, async (commit) => {
    await held.promise; return commit(async () => { writes++; return 'A'; });
  });
  epoch = 2;
  const b = coordinator.run(shiftOwner('GB', 2), () => epoch === 2, async (commit) =>
    commit(async () => 'B'));
  held.resolve();
  check('same UID driver company with a new generation and epoch invalidates old publication',
    (await a).kind === 'superseded' && (await b).kind === 'applied' && writes === 0);
}

// Recovery uses strict conditional deletion and cannot reconcile after unverifiable absence.
for (const scenario of ['delete_throws', 'raw_remains', 'readback_throws', 'generation_changed', 'exact_success']) {
  let raw = JSON.stringify({ generation: scenario === 'generation_changed' ? 'GB' : 'GA' });
  let reads = 0; let reconciled = 0; let exhausted = 0; let failedCleanup = false;
  try {
    await runStrictRecoverySessionCleanup({
      stillCurrent: () => true, generation: 'GA',
      strictClear: (generation) => strictClearRawSessionIfGeneration(generation, {
        readRaw: async () => {
          reads++;
          if (scenario === 'readback_throws' && reads > 1) throw new Error('readback');
          return raw;
        },
        deleteRaw: async () => {
          if (scenario === 'delete_throws') throw new Error('delete');
          if (scenario !== 'raw_remains') raw = null;
        },
      }, (value) => JSON.parse(value).generation),
      exhaustOwnedLatch: async () => { exhausted++; },
    });
    reconciled++;
  } catch { failedCleanup = true; }
  const success = scenario === 'exact_success';
  check(`strict recovery ${scenario} ${success ? 'continues only after verified absence' : 'fails closed and exhausts latch'}`,
    success
      ? !failedCleanup && raw === null && reconciled === 1 && exhausted === 0
      : failedCleanup && reconciled === 0 && exhausted === 1
        && (scenario === 'readback_throws' ? raw === null : raw !== null));
}

// Readiness is the final operation, after deferred latch bookkeeping and exact identity verification.
{
  let current = true; let ready = 0; const heldAttach = deferred();
  const finalizing = finalizeGovernedInstallation({
    stillCurrent: () => current,
    attachRecovery: async () => heldAttach.promise,
    verifyExactIdentity: async () => true,
    persistFinalizedMarker: async () => {},
    publishReady: () => { ready++; },
  });
  current = false; heldAttach.resolve('applied');
  check('superseded installation during deferred latch attachment never publishes readiness',
    await finalizing === 'owner_superseded' && ready === 0);
}

const attempt = { state: 'attempt-A', createdAtMs: 1, consumed: false };
const makeMutator = (state, clearFailure = false) => createSerializedLatchMutator({
  load: async () => state.latch,
  save: async (value) => { state.latch = value; },
  clear: async () => { if (clearFailure) throw new Error('clear'); state.latch = null; },
});

{
  const state = { latch: null }; const mutator = makeMutator(state);
  const outcome = await attachRetryGenerationForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => attempt,
    generation: 'GB', attach: (expected, generation, current) => mutator.attachRetryGeneration(expected, generation, current),
  });
  check('normal login with no active recovery latch is not_applicable', outcome === 'not_applicable');
}
{
  const state = { latch: latch() }; const mutator = makeMutator(state);
  const attached = await attachRetryGenerationForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => attempt,
    generation: 'GB', attach: (expected, generation, current) => mutator.attachRetryGeneration(expected, generation, current),
  });
  const consumed = await consumeRecoveryLatchForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => attempt,
    sessionGeneration: 'GB', nowMs: () => 3,
    consume: (input, current) => mutator.consumeIfMatching(input, current),
  });
  check('matching active recovery latch attaches and consumes', attached === 'applied' && consumed === 'applied' && state.latch === null);
}
{
  const state = { latch: latch({ state: 'attempt-other' }) }; const mutator = makeMutator(state);
  const outcome = await attachRetryGenerationForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => attempt,
    generation: 'GB', attach: (expected, generation, current) => mutator.attachRetryGeneration(expected, generation, current),
  });
  check('active recovery latch for another attempt fails closed', outcome === 'active_latch_mismatch');
}
{
  const state = { latch: latch({ retryGeneration: 'GC' }) }; const mutator = makeMutator(state);
  const outcome = await consumeRecoveryLatchForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => attempt,
    sessionGeneration: 'GB', nowMs: () => 3,
    consume: (input, current) => mutator.consumeIfMatching(input, current),
  });
  check('active recovery latch for another generation fails closed', outcome === 'active_latch_mismatch' && state.latch !== null);
}
{
  const state = { latch: latch() }; const mutator = makeMutator(state); const held = deferred();
  await mutator.save(latch({ state: 'newer-attempt', createdAtMs: 9 }), () => true);
  const pendingOutcome = attachRetryGenerationForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => { await held.promise; return attempt; },
    generation: 'GB', attach: (expected, generation, current) => mutator.attachRetryGeneration(expected, generation, current),
  });
  held.resolve();
  const outcome = await pendingOutcome;
  check('latch replacement while queued cannot be silently accepted', outcome === 'active_latch_mismatch');
}
{
  const state = { latch: latch({ retryGeneration: 'GB' }) }; const mutator = makeMutator(state, true);
  const outcome = await consumeRecoveryLatchForCurrentOwner({
    stillCurrent: () => true, loadLatch: async () => state.latch, loadAttempt: async () => attempt,
    sessionGeneration: 'GB', nowMs: () => 3,
    consume: (input, current) => mutator.consumeIfMatching(input, current),
  });
  check('recovery latch storage clear failure cannot produce applied', outcome === 'storage_failure' && state.latch !== null);
}

// Lifecycle validates latch consumption before writing authoritative context or returning ready.
{
  let saves = 0;
  const out = await obtainAuthoritativeContext({
    nowMs: () => 1, loadOwnership: async () => null, saveOwnership: async () => {}, saveLaunch: async () => {},
    loadLaunch: async () => ({ requestId: 'A'.repeat(43) }), loadSession: async () => ({ generation: 'GB' }),
    get: async () => ({ ok: true, view: { state: 'pending', requestId: 'A'.repeat(43), intent: 'read', jobRef: null, groupRef: null, expiresAtMs: 10 } }),
    consumeRecoveryLatch: async () => 'active_latch_mismatch',
    saveContext: async () => { saves++; }, loadContext: async () => null,
    complete: async () => ({ ok: false, refusal: 'network' }), savePending: async () => {}, loadPending: async () => null, clearPending: async () => {},
  });
  check('request lifecycle cannot persist context or report ready after latch mismatch', out.kind === 'fail_closed' && saves === 0);
}

console.log(`\nRESULT passed=${passed} failed=${failed} total=${passed + failed}`);
process.exit(failed ? 1 : 0);
