import { classifyGovernedStartup, strictStartupPresentation } from '../services/sso/jsaIdentityStartupContract.ts';
import { createRevisionSignal } from '../services/sso/jsaRevisionSignal.ts';
import { createWatcherMountCoordinator, decideLogoutSignal } from '../services/sso/jsaLogoutWatcherContract.ts';
import { createGuardedCompleteLogoutOps, runCompleteJsaLogout } from '../services/sso/jsaLogoutContract.ts';
import { claimModalSaveFlight, runSignatureSaveSingleFlight, saveGovernedSignatureAfterConfirmation } from '../services/sso/jsaSignatureSaveContract.ts';

let pass = 0; let fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } }
function deferred() { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }

// 1. Background Suite logout stays pending until foreground verified logout.
let storedBaseline = 10; let active = false; let navigation = 0; let logoutRuns = 0;
const background = decideLogoutSignal(storedBaseline, 20);
if (background.kind === 'initialize') storedBaseline = background.value;
if (background.kind === 'logout_required' && active) logoutRuns++;
check('1A background advanced signal does not navigate or advance baseline', background.kind === 'logout_required'
  && navigation === 0 && logoutRuns === 0 && storedBaseline === 10);

active = true;
const foreground = decideLogoutSignal(storedBaseline, 20);
if (foreground.kind === 'logout_required' && active) logoutRuns++;
check('1B foreground direct read sees pending signal and requests logout once', foreground.kind === 'logout_required' && logoutRuns === 1);

let baselineDeleteCalls = 0;
const failResult = await runCompleteJsaLogout(createGuardedCompleteLogoutOps({
  clearFirebaseAuth: async () => true,
  clearLegacyDriverSession: async () => {}, clearGovernedState: async () => {},
  clearCanonicalIdentityState: async () => { baselineDeleteCalls++; storedBaseline = null; },
  resetAuthContext: async () => { throw new Error('react_reset_failed'); },
}));
if (failResult.verified) navigation++;
check('1C real guarded ordering retains baseline when React reset fails', !failResult.verified
  && !failResult.reactContextReset && baselineDeleteCalls === 0 && storedBaseline === 10 && navigation === 0);

const cleared = { firebase: false, local: false, governed: false, baseline: false, context: false };
const successResult = await runCompleteJsaLogout(createGuardedCompleteLogoutOps({
  clearFirebaseAuth: async () => { cleared.firebase = true; return true; },
  clearLegacyDriverSession: async () => { cleared.local = true; },
  clearGovernedState: async () => { cleared.governed = true; },
  clearCanonicalIdentityState: async () => { baselineDeleteCalls++; storedBaseline = null; cleared.baseline = true; },
  resetAuthContext: async () => { cleared.context = true; },
}));
if (successResult.verified) navigation++;
check('1D successful retry clears every section and routes once', successResult.verified
  && Object.values(cleared).every(Boolean) && storedBaseline === null && baselineDeleteCalls === 1 && navigation === 1);

// 2. Strict classification is the sole readiness/presentation source.
const pair = { uid: 'u', driverId: 'd', companyId: 'c' };
const mismatchInputs = [
  { rawSessionPresent: true, session: pair, firebaseUid: null, tokenDriverId: null, tokenCompanyId: null },
  { rawSessionPresent: false, session: null, firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c' },
  { rawSessionPresent: true, session: null, firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c' },
  { rawSessionPresent: true, session: pair, firebaseUid: 'other', tokenDriverId: 'd', tokenCompanyId: 'c' },
  { rawSessionPresent: true, session: pair, firebaseUid: 'u', tokenDriverId: 'other', tokenCompanyId: 'c' },
  { rawSessionPresent: true, session: pair, firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'other' },
  { rawSessionPresent: true, session: pair, firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c', baselineBound: false },
];
const mismatchPresentations = mismatchInputs.map((input) => strictStartupPresentation(classifyGovernedStartup(input)));
check('2A every mismatch disables readiness/watcher/standalone and blocks protected content', mismatchPresentations.every((p) =>
  !p.governedReady && !p.watcherAllowed && p.protectedContentBlocked && !p.standaloneAvailable && p.retrySignOutVisible));
const pending = strictStartupPresentation(null);
check('2B unresolved inspection is fail-closed checking state', pending.inspectionPending && pending.protectedContentBlocked
  && !pending.governedReady && !pending.watcherAllowed && !pending.standaloneAvailable);
const usable = strictStartupPresentation(classifyGovernedStartup({ rawSessionPresent: true, session: pair,
  firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c', baselineBound: true }));
check('2C exact strict pair alone enables governed readiness and watcher', usable.governedReady && usable.watcherAllowed && !usable.retrySignOutVisible);

// 3. Layout-equivalent pipeline: revision -> strict inspection -> stable exact binding -> watcher.
function readinessHarness(inspect) {
  const revision = createRevisionSignal();
  const coordinator = createWatcherMountCoordinator();
  let generation = 0; let binding = null; let ready = false; let blocked = true;
  let inspections = 0; let starts = 0; let stops = 0; const pendingRuns = [];
  const refresh = async () => {
    const mine = ++generation; inspections++;
    const detail = await inspect();
    if (mine !== generation) return;
    const presentation = strictStartupPresentation(detail.state);
    ready = presentation.governedReady; blocked = presentation.protectedContentBlocked;
    const next = detail.binding;
    const same = binding && next && binding.uid === next.uid && binding.driverId === next.driverId && binding.companyId === next.companyId;
    if (!ready || !next) { binding = null; coordinator.dispose(); return; }
    if (same) return;
    binding = next;
    await coordinator.activate(next, async () => { starts++; return () => { stops++; }; });
  };
  let unsubscribe = null;
  return {
    revision,
    subscribe() { unsubscribe = revision.subscribe(() => { const run = refresh(); pendingRuns.push(run); }); },
    unsubscribe() { unsubscribe?.(); unsubscribe = null; },
    async flush() { while (pendingRuns.length) await Promise.all(pendingRuns.splice(0)); },
    state() { return { binding, ready, blocked, inspections, starts, stops }; },
  };
}

const usableDetail = { state: 'usable', binding: pair };
const late = readinessHarness(async () => usableDetail);
late.revision.publish(); late.subscribe(); await late.flush();
check('3A publish-before-subscribe replays, inspects, and attaches exact watcher once', late.state().ready
  && late.state().binding === pair && late.state().starts === 1 && late.state().inspections === 1);
late.revision.publish(); await late.flush();
check('3B replay/current delivery for same binding does not stop or restart', late.state().starts === 1 && late.state().stops === 0);

const mismatch = readinessHarness(async () => ({ state: 'authority_mismatch', binding: null }));
mismatch.revision.publish(); mismatch.subscribe(); await mismatch.flush();
check('3C late mismatch stays blocked with zero watcher starts', !mismatch.state().ready && mismatch.state().blocked && mismatch.state().starts === 0);

const aInspection = deferred(); let nextInspection = () => aInspection.promise;
const replacement = readinessHarness(() => nextInspection());
replacement.subscribe();
nextInspection = async () => ({ state: 'usable', binding: { ...pair, uid: 'B' } });
replacement.revision.publish(); await new Promise((resolve) => setTimeout(resolve, 0));
aInspection.resolve({ state: 'usable', binding: { ...pair, uid: 'A' } }); await replacement.flush();
check('3D delayed old inspection cannot replace new exact binding', replacement.state().binding.uid === 'B'
  && replacement.state().starts === 1 && replacement.state().stops === 0);

const beforeUnsubscribe = late.state().inspections;
late.unsubscribe(); late.revision.publish(); await late.flush();
check('3E unsubscribe prevents later inspection and watcher changes', late.state().inspections === beforeUnsubscribe && late.state().starts === 1);

// 4. Modal boundary grants close/reset ownership to one invocation.
const settingsHolder = { current: null }; const modalHolder = { current: null };
const gate = deferred(); let callable = 0; let commits = 0; let closes = 0; let settlements = 0; let displayed = 'old';
const settingsSave = () => runSignatureSaveSingleFlight(settingsHolder, () => saveGovernedSignatureAfterConfirmation('new', {
  persist: async () => { callable++; await gate.promise; }, commit: (value) => { commits++; displayed = value; }, reportFailure: () => {},
}), () => { settlements++; });
const modalSave = async () => {
  const flight = claimModalSaveFlight(modalHolder, settingsSave);
  const saved = await flight.promise;
  if (flight.owner && saved !== false) closes++;
};
const m1 = modalSave(); const m2 = modalSave(); gate.resolve(); await Promise.all([m1, m2]);
check('4A double Save has one callable, commit, close, and settlement', callable === 1 && commits === 1
  && closes === 1 && settlements === 1 && displayed === 'new');

const failedSettings = { current: null }; const failedModal = { current: null };
callable = commits = closes = settlements = 0; displayed = 'old';
const failedSave = () => runSignatureSaveSingleFlight(failedSettings, () => saveGovernedSignatureAfterConfirmation('new', {
  persist: async () => { callable++; throw new Error('denied'); }, commit: () => { commits++; }, reportFailure: () => {},
}), () => { settlements++; });
const failedModalSave = async () => {
  const flight = claimModalSaveFlight(failedModal, failedSave);
  const saved = await flight.promise;
  if (flight.owner && saved !== false) closes++;
};
await Promise.all([failedModalSave(), failedModalSave()]);
check('4B failed double Save has one attempt, no commit/close, prior display, retry-ready', callable === 1
  && commits === 0 && closes === 0 && settlements === 1 && displayed === 'old' && failedModal.current === null && failedSettings.current === null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
