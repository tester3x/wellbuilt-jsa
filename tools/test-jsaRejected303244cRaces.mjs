import {
  attachRetryGenerationForCurrentOwner,
  consumeRecoveryLatchForCurrentOwner,
  createSerializedLatchMutator,
  finalizeGovernedInstallation,
} from '../services/sso/jsaGovernedAuth.ts';
import { createShiftRefreshOwnership, commitOwnedShiftRefresh } from '../services/sso/jsaShiftRefreshOwnership.ts';
import { strictClearRawSessionIfGeneration } from '../services/sso/jsaStrictSessionCleanup.ts';
import { runStrictRecoverySessionCleanup } from '../services/sso/jsaStrictRecoveryCleanup.ts';
import { obtainAuthoritativeContext } from '../services/sso/jsaRequestLifecycle.ts';

let passed = 0; let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? passed++ : failed++; };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const latch = (overrides = {}) => ({
  state: 'attempt-A', createdAtMs: 1, usedAtMs: 2, phase: 'recovering',
  failedGeneration: 'GA', retryGeneration: null, ...overrides,
});

// Exact live-facing shift owner: B gets a distinct network flight and A cannot commit.
{
  const ownership = createShiftRefreshOwnership();
  const state = { storageShift: null, verified: false, surface: 'none', verdict: 'none', job: null, history: null };
  let networkStarts = 0;
  const heldA = deferred(); networkStarts++;
  const ownerA = ownership.bind(ownership.reserve(), {
    sessionGeneration: 'GA', uid: 'uA', driverId: 'dA', companyId: 'cA',
    expectedShiftId: 'shift-A-old', historyRequestSequence: 1,
  });
  const flightA = heldA.promise.then(() => commitOwnedShiftRefresh(
    () => ownership.isCurrent(ownerA),
    [
      () => { state.storageShift = 'shift-A-new'; state.verified = true; },
      () => { state.surface = 'verified'; },
      () => { state.verdict = 'server_open'; },
      () => { state.job = 'A-job'; },
      () => { state.history = 'A-history'; },
    ],
  ));
  const heldB = deferred(); networkStarts++;
  const ownerB = ownership.bind(ownership.reserve(), {
    sessionGeneration: 'GB', uid: 'uB', driverId: 'dB', companyId: 'cB',
    expectedShiftId: null, historyRequestSequence: 2,
  });
  heldA.resolve(); const aCommitted = await flightA;
  check('deferred Driver A shift refresh cannot mutate Driver B storage or UI and B does not join A',
    !aCommitted && ownership.isCurrent(ownerB) && networkStarts === 2
      && state.storageShift === null && !state.verified && state.surface === 'none'
      && state.verdict === 'none' && state.job === null && state.history === null);
  heldB.resolve();
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
