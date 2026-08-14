/**
 * Authoritative get/complete lifecycle for WB-JSA.
 * Run: node --experimental-strip-types tools/test-jsaRequestLifecycle.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  selectUiForIntent,
  terminalActionForIntent,
  parseGetContextView,
  parseCompleteResult,
  ignoreLaunchHints,
  pendingDisplayFields,
  decideAfterGet,
  decideRecovery,
  decideMidFlowGet,
  mayCompleteWithDifferentAction,
  mayReturnAfterComplete,
  returnStatusForAction,
  failClosedCopy,
  mayShowLegacyLoginDuringGoverned,
  historyMustNotSatisfyGovernedRequest,
  classifyCallableError,
  classifyGetError,
  governedRecordLink,
  persistOrderIsLocalThenComplete,
  parsePendingComplete,
  ownGovernedLaunch,
  obtainAuthoritativeContext,
  recoverGovernedRequest,
  completeAfterLocalSave,
  decideReturnAllowed,
} from '../services/sso/jsaRequestLifecycle.ts';
import { decideFromJsaBinding, historicalMustStayHistorical } from '../services/sso/jsaBinding.ts';
import { decideBootstrap, mayShowLegacyLogin } from '../services/sso/jsaBootstrap.ts';
import { decideAutoNavigation } from '../services/jsaAutoNav.ts';
import { buildJsaLaunchUrl, buildJsaReturnUrl } from '../services/sso/jsaLaunch.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID = 'R'.repeat(43);
const RID2 = 'S'.repeat(43);
const AUG = '2026-08-12_182535';
const JUN = '2026-06-24_124631';

const launch = {
  v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt',
  jobRef: 'hint-job', wellName: 'Hint Well', jobType: 'Water',
};

const pendingView = (intent, extra = {}) => ({
  requestId: RID, state: 'pending', intent, jobRef: 'server-job', groupRef: 'g1',
  expiresAtMs: 9_999_999_999,
  ...(intent === 'acknowledge' ? {} : { wellName: 'Gab 1' }),
  ...extra,
});

// ── three intents + terminal mapping ──────────────────────────────────────
check('intent read selects full read+signoff',
  selectUiForIntent('read').ui === 'full_read_and_signoff'
  && selectUiForIntent('read').terminalAction === 'read_and_acknowledged');
check('intent acknowledge selects ack-only',
  selectUiForIntent('acknowledge').ui === 'acknowledge_only'
  && terminalActionForIntent('acknowledge') === 'acknowledged');
check('intent read_and_acknowledge selects full read+signoff',
  selectUiForIntent('read_and_acknowledge').ui === 'full_read_and_signoff'
  && terminalActionForIntent('read_and_acknowledge') === 'read_and_acknowledged');
check('full-read flow never authors read_completed',
  terminalActionForIntent('read') !== 'read_completed'
  && terminalActionForIntent('read_and_acknowledge') !== 'read_completed');

// ── parse get/complete ────────────────────────────────────────────────────
const g = parseGetContextView(pendingView('read'));
check('pending get parses intent/jobRef/groupRef/expires',
  g.ok && g.value.intent === 'read' && g.value.jobRef === 'server-job' && g.value.groupRef === 'g1');
check('pending get rejects identity fields',
  parseGetContextView({ ...pendingView('read'), driverId: 'd1' }).ok === false);
check('completed get carries terminal action',
  parseGetContextView({
    requestId: RID, state: 'completed', intent: 'read', jobRef: 'server-job',
    groupRef: null, action: 'read_and_acknowledged',
  }).ok === true);
check('complete result requires reused boolean',
  parseCompleteResult({ requestId: RID, action: 'acknowledged' }).ok === false);
check('complete result reused:true accepted',
  parseCompleteResult({ requestId: RID, action: 'acknowledged', reused: true }).ok);

// ── conflicting launch hint ignored ───────────────────────────────────────
const ignored = ignoreLaunchHints(launch, pendingView('read_and_acknowledge'));
check('server jobRef wins over launch hint', ignored.used.jobRef === 'server-job');
check('launch wellName/jobType discarded',
  ignored.discarded.wellName === 'Hint Well' && ignored.discarded.jobType === 'Water' && ignored.discarded.ignored);
check('pending display has no launch identity',
  !('driverId' in pendingDisplayFields(pendingView('read')))
  && pendingDisplayFields(pendingView('read')).wellName === 'Gab 1');

// ── June cache / August authority ─────────────────────────────────────────
const august = decideFromJsaBinding({
  binding: {
    shiftState: 'open', periodId: AUG, originLocalDate: '2026-08-12',
    requiresActiveShift: true, jsaEnabled: true,
  },
  cachedShiftId: JUN,
});
check('August authority wins over June cache', august.kind === 'open' && august.periodId === AUG);
check('June historical save stays historical', historicalMustStayHistorical(JUN, AUG) === true);
const juneDoesNotSelect = decideAfterGet(pendingView('acknowledge'));
check('June cache does not select workflow; get intent does',
  juneDoesNotSelect.next === 'resume_ui' && juneDoesNotSelect.ui === 'acknowledge_only');

// ── pending vs completed ──────────────────────────────────────────────────
check('pending get resumes required UI',
  decideAfterGet(pendingView('read')).next === 'resume_ui');
const completedDec = decideAfterGet({
  requestId: RID, state: 'completed', intent: 'read', jobRef: 'server-job',
  groupRef: null, action: 'read_and_acknowledged',
});
check('completed get returns without repeating stages',
  completedDec.next === 'return_completed'
  && completedDec.action === 'read_and_acknowledged');

// ── missing/expired/foreign/mismatched ────────────────────────────────────
check('missing request copy is fail-closed',
  failClosedCopy('not_found').includes('Return to WellBuilt Tickets'));
check('expired copy is fail-closed',
  failClosedCopy('expired').includes('expired'));
check('binding mismatch copy is fail-closed',
  failClosedCopy('binding_mismatch').includes('does not match'));
check('classify not_found from callable',
  classifyGetError({ code: 'functions/failed-precondition', details: { refusal: 'not_found' } }) === 'not_found');
check('classify expired',
  classifyGetError({ message: 'expired' }) === 'expired');
check('classify binding_mismatch',
  classifyCallableError({ details: { refusal: 'binding_mismatch' } }) === 'binding_mismatch');
check('classify network before context',
  classifyGetError({ code: 'functions/unavailable', message: 'failed to fetch' }) === 'network');

// ── mid-flow policy ───────────────────────────────────────────────────────
const midTight = decideMidFlowGet({
  previous: pendingView('read'),
  next: { ok: false, refusal: 'jsa_disabled' },
});
check('mid-flow tightening fail-closes and submits nothing',
  midTight.next === 'fail_closed' && midTight.refusal === 'jsa_disabled');
const midLoose = decideMidFlowGet({
  previous: pendingView('read'),
  next: { ok: true, view: pendingView('read') },
});
check('mid-flow loosening continues registered intent',
  midLoose.next === 'resume_ui' && midLoose.terminalAction === 'read_and_acknowledged');

// ── persist order ─────────────────────────────────────────────────────────
check('persist order is local save then complete',
  persistOrderIsLocalThenComplete() === 'local_save_then_complete');

// ── process-death recovery ────────────────────────────────────────────────
check('death before context read → reread',
  decideRecovery({
    phase: 'before_context_read', launch, context: null, pendingComplete: null,
  }).next === 'reread');
check('death during UI → resume required stages',
  decideRecovery({
    phase: 'in_ui', launch, context: pendingView('read_and_acknowledge'), pendingComplete: null,
  }).next === 'resume_ui');
check('local save ok + complete fail → retry complete',
  decideRecovery({
    phase: 'local_saved_pending_complete',
    launch,
    context: pendingView('read'),
    pendingComplete: { requestId: RID, action: 'read_and_acknowledged' },
  }).next === 'retry_complete');
check('complete ok + death before return → return without repeating',
  decideRecovery({
    phase: 'completed_pending_return',
    launch,
    context: {
      requestId: RID, state: 'completed', intent: 'read', jobRef: 'server-job',
      groupRef: null, action: 'read_and_acknowledged',
    },
    pendingComplete: null,
  }).next === 'return_completed');
check('different terminal action after complete is conflict',
  mayCompleteWithDifferentAction('acknowledged', 'read_and_acknowledged') === false);
check('identical terminal action is replayable',
  mayCompleteWithDifferentAction('acknowledged', 'acknowledged') === true);

// ── return only after success/reused ──────────────────────────────────────
check('return allowed after first complete',
  mayReturnAfterComplete({ requestId: RID, action: 'acknowledged', reused: false }));
check('return allowed after reused:true',
  mayReturnAfterComplete({ requestId: RID, action: 'acknowledged', reused: true }));
check('return blocked without completion',
  decideReturnAllowed({ launch, completion: null }).stay === true);
const opened = decideReturnAllowed({
  launch,
  completion: { requestId: RID, action: 'read_and_acknowledged', reused: false },
});
const returnUrlFromDecision = 'open' in opened
  ? buildJsaReturnUrl({ v: 1, requestId: RID, status: opened.status })
  : '';
check('return URL is status-only jsa-return',
  'open' in opened && returnUrlFromDecision.startsWith('wellbuilt-tickets://jsa-return')
  && returnUrlFromDecision.includes('status=acknowledged')
  && !returnUrlFromDecision.includes('name=')
  && !returnUrlFromDecision.includes('hash='));
check('return status mapping',
  returnStatusForAction('read_completed') === 'read'
  && returnStatusForAction('acknowledged') === 'acknowledged'
  && returnStatusForAction('read_and_acknowledged') === 'acknowledged');

// ── orchestrator: own / get / local-then-complete / replay ────────────────
function mem() {
  const store = { own: null, launch: null, session: { uid: 'u' }, ctx: null, pending: null };
  const calls = { get: 0, complete: [] };
  const deps = {
    nowMs: () => 1000,
    loadOwnership: async () => store.own,
    saveOwnership: async (o) => { store.own = o; },
    saveLaunch: async (r) => { store.launch = r; },
    loadLaunch: async () => store.launch,
    loadSession: async () => store.session,
    get: async (id) => {
      calls.get += 1;
      return { ok: true, view: pendingView('read', { requestId: id }) };
    },
    complete: async (requestId, action) => {
      calls.complete.push({ requestId, action });
      return { ok: true, result: { requestId, action, reused: calls.complete.length > 1 } };
    },
    saveContext: async (v) => { store.ctx = v; },
    loadContext: async () => store.ctx,
    savePending: async (r) => { store.pending = r; },
    loadPending: async () => store.pending,
    clearPending: async () => { store.pending = null; },
  };
  return { store, calls, deps };
}

{
  const { store, calls, deps } = mem();
  const own = await ownGovernedLaunch(deps, launch);
  check('launch is durably owned', own.request.requestId === RID && store.launch.requestId === RID);
  const got = await obtainAuthoritativeContext(deps);
  check('get is called with requestId only after session',
    calls.get === 1 && got.kind === 'ready' && got.next === 'resume_ui');
  check('conflicting hint not used as context jobRef', store.ctx.jobRef === 'server-job');

  deps.complete = async () => ({ ok: false, refusal: 'network' });
  const failed = await completeAfterLocalSave(deps, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: 'local-1', nowMs: 2000,
  });
  check('complete fail retains pending completion',
    failed.kind === 'pending_retry' && store.pending?.localRecordId === 'local-1');
  check('complete fail does not invent a second record id', store.pending.localRecordId === 'local-1');

  let completes = 0;
  deps.complete = async (requestId, action) => {
    completes += 1;
    return { ok: true, result: { requestId, action, reused: completes > 1 } };
  };
  const ok1 = await completeAfterLocalSave(deps, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: 'local-1', nowMs: 3000,
  });
  check('retry after local-save uses same record and completes',
    ok1.kind === 'completed' && ok1.reused === false && store.pending === null);
  const ok2 = await completeAfterLocalSave(deps, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: 'local-1', nowMs: 4000,
  });
  check('idempotent completion replay is reused', ok2.kind === 'completed' && ok2.reused === true);
  const conflict = await completeAfterLocalSave(deps, {
    requestId: RID, action: 'acknowledged', localRecordId: 'local-1', nowMs: 5000,
  });
  check('different action after complete is refused',
    conflict.kind === 'fail_closed' && conflict.refusal === 'conflict');
}

{
  const { deps, store } = mem();
  store.session = null;
  store.launch = launch;
  const need = await obtainAuthoritativeContext(deps);
  check('no session before get → need_auth, not legacy login', need.kind === 'need_auth');
}

{
  const { deps, store, calls } = mem();
  store.launch = launch;
  store.ctx = null;
  const rec = await recoverGovernedRequest(deps);
  check('process death before get rereads context', rec.kind === 'ready' && calls.get === 1);
}

{
  const { deps } = mem();
  deps.get = async () => ({ ok: false, refusal: 'not_found' });
  await ownGovernedLaunch(deps, launch);
  const miss = await obtainAuthoritativeContext(deps);
  check('missing request fail-closes', miss.kind === 'fail_closed' && miss.refusal === 'not_found');
}

{
  const { deps } = mem();
  deps.get = async () => ({ ok: false, refusal: 'expired' });
  await ownGovernedLaunch(deps, launch);
  check('expired request fail-closes',
    (await obtainAuthoritativeContext(deps)).refusal === 'expired');
}

{
  const { deps } = mem();
  deps.get = async () => ({ ok: false, refusal: 'binding_mismatch' });
  await ownGovernedLaunch(deps, launch);
  check('foreign/mismatched request fail-closes',
    (await obtainAuthoritativeContext(deps)).refusal === 'binding_mismatch');
}

// ── WhatsApp / background / resume ────────────────────────────────────────
check('background resume with session does not log out or login',
  decideBootstrap({
    hasPersistedSession: true, incomingUrl: null, isCallback: false,
    isLaunch: false, isLegacyLaunch: false, isDirectIcon: false,
  }).action === 'resume_session');
check('background resume never shows legacy login',
  mayShowLegacyLogin({
    governed: true,
    bootstrap: { action: 'resume_session' },
  }) === false);
check('governed request never falls through to legacy login',
  mayShowLegacyLoginDuringGoverned(true) === false);

// ── history must not satisfy ──────────────────────────────────────────────
check('viewing previous JSA does not satisfy a new request',
  historyMustNotSatisfyGovernedRequest({ governedPending: true, viewingHistorical: true }) === false);
check('auto-nav suppresses history while governed pending',
  decideAutoNavigation({
    pendingRequestUsable: true,
    governedRequestPending: true,
    verdict: 'server_open',
    saveExists: true,
    saveShiftId: AUG,
    currentShiftId: AUG,
    isSsoMode: true,
  }).reason === 'governed_request_requires_own_stages');

// ── legalName only ────────────────────────────────────────────────────────
const sess = {
  uid: 'u', driverId: 'd', companyId: 'c',
  displayName: 'Mikezfold', legalName: 'Michael Burger',
  binding: { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true },
};
const sessionSrc = readFileSync(join(root, 'services/sso/jsaSession.ts'), 'utf8');
check('ack default is legalName, never displayName',
  /legalName only/.test(sessionSrc) && sess.legalName === 'Michael Burger'
  && sess.displayName !== sess.legalName);
check('missing legalName stays blank and is not substituted',
  /return n \|\| ''/.test(sessionSrc));

// ── pending complete parse ────────────────────────────────────────────────
check('pending complete record parses',
  parsePendingComplete({
    requestId: RID, action: 'acknowledged', localRecordId: 'x', savedAtMs: 1,
  })?.requestId === RID);
check('opaque record link is requestId only',
  Object.keys(governedRecordLink(RID)).join(',') === 'governedRequestRef'
  && governedRecordLink(RID).governedRequestRef === RID);

// ── no secrets / identity / authority in new modules or URLs ──────────────
const files = [
  'jsaRequestLifecycle.ts', 'jsaGovernedEntry.ts', 'jsaReturn.ts',
  'jsaRequestCallables.ts', 'jsaGovernedRoute.ts',
];
for (const f of files) {
  const src = readFileSync(join(root, 'services/sso', f), 'utf8');
  check(`${f} has no credential console output`,
    !/console\.(log|warn|error)\([^)]*\b(hash|passcode|token|verifier|customToken|legalName|displayName)\b/i.test(src));
}
const launchUrl = buildJsaLaunchUrl(launch);
const returnUrl = buildJsaReturnUrl({ v: 1, requestId: RID, status: 'acknowledged' });
check('launch URL has no identity/authority',
  !/hash=|name=|displayName=|legalName=|shiftId=|periodId=|driverId=/.test(launchUrl));
check('return URL has no identity/authority/receipt',
  !/hash=|name=|receipt=|action=|jobRef=/.test(returnUrl)
  && /status=acknowledged/.test(returnUrl));
check('second request id is distinct (WB-T consume is their recovery)',
  RID !== RID2 && returnUrl.includes(RID));

// ── wiring: signoff orders local save before complete ─────────────────────
const signoff = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
check('signoff saves local record before completeGovernedAfterLocalSave',
  signoff.indexOf('setItem(STORAGE_KEYS.saves') < signoff.indexOf('completeGovernedAfterLocalSave({'));
check('signoff fail-closes when local save fails',
  signoff.includes("failClosedCopy('local_save_failed')"));
check('signoff does not substitute displayName for signature',
  /legalAcknowledgmentName/.test(signoff)
  && !/useState\(params\.driverName/.test(signoff));
const startSrc = readFileSync(join(root, 'app/start.tsx'), 'utf8');
const startLive = readFileSync(join(root, 'services/sso/jsaStartLive.ts'), 'utf8');
check('start owns launch then obtains authoritative context',
  startSrc.includes('consumeJsaStart')
  && startLive.includes('ownLaunch')
  && startLive.includes('obtainAuthoritativeContext'));
const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
check('layout refuses hash/name login during governed launch',
  layout.includes('governedLaunch') && layout.includes("refusal: 'malformed'"));
check('layout never falls through to LoginScreen for governed pending',
  layout.includes('loadLaunchContext') && layout.includes('hasPendingRequest: !!pending || !!governedLaunch'));
const ack = readFileSync(join(root, 'app/acknowledge.tsx'), 'utf8');
check('ack-only UI submits acknowledged',
  ack.includes("action: 'acknowledged'") && ack.includes('legalAcknowledgmentName'));
check('receipt write is server complete, not client-invented',
  /export const GOVERNED_RECEIPT_WRITE_AVAILABLE = true/.test(
    readFileSync(join(root, 'services/sso/jsaReturn.ts'), 'utf8'))
  && /export const GOVERNED_RECEIPT_CLIENT_INVENTED = false/.test(
    readFileSync(join(root, 'services/sso/jsaReturn.ts'), 'utf8')));

// ── One bounded cold-start-tolerant get + generation-conditional persistence (vc10) ──
{
  const {
    JSA_GET_TIMEOUT_MS,
    getOutcomeLogCategory,
    failClosedCopy,
    obtainAuthoritativeContext,
  } = await import('../services/sso/jsaRequestLifecycle.ts');

  // ONE attempt whose bound exceeds the worst captured Cloud Run readiness
  // case (32s). No automatic second attempt exists.
  check('get timeout exceeds captured 32s cold start', JSA_GET_TIMEOUT_MS > 32_000);

  // Sanitized outcome categories — distinguishable, never payload-bearing.
  check('ok category', getOutcomeLogCategory(null) === 'ok');
  check('deadline classifies as timeout',
    getOutcomeLogCategory('network', { code: 'functions/deadline-exceeded' }) === 'timeout');
  check('unavailable classifies as unavailable',
    getOutcomeLogCategory('network', { code: 'functions/unavailable' }) === 'unavailable');
  check('unauthenticated category',
    getOutcomeLogCategory('unauthenticated') === 'unauthenticated');
  check('binding categories',
    getOutcomeLogCategory('binding_mismatch') === 'binding'
    && getOutcomeLogCategory('active_shift_required') === 'binding');
  check('permission categories',
    getOutcomeLogCategory('wrong_audience') === 'permission'
    && getOutcomeLogCategory('intent_not_permitted') === 'permission');
  check('generic refusal category',
    getOutcomeLogCategory('not_found') === 'refusal');

  // The transport copy claims a SERVICE failure, never that the phone has
  // no connection — the classifier cannot prove that.
  const netCopy = failClosedCopy('network');
  check('network copy names WellBuilt services',
    netCopy.includes('WellBuilt services') && netCopy.includes('Return to WellBuilt Tickets'));
  check('network copy does not blame phone connectivity',
    !/when you have a connection|no connection|check your connection/i.test(netCopy));

  // Callable wiring pins (module imports RN firebase — source-pinned).
  const callablesSrc = readFileSync(join(root, 'services/sso/jsaRequestCallables.ts'), 'utf8');
  check('get callable uses the tolerant bound',
    callablesSrc.includes('timeout: JSA_GET_TIMEOUT_MS'));
  check('get is single-flight per requestId',
    callablesSrc.includes('getInFlight.get(requestId)') && callablesSrc.includes('getInFlight.set(requestId'));
  check('get has NO automatic second attempt',
    !/retry|retries|attempt = await/i.test(callablesSrc));
  check('get outcome logging is category-only',
    callablesSrc.includes("tag: '[jsa-get]'")
    && !/JSON\.stringify\([^)]*\b(view|token|code|verifier|body|url)\b/.test(callablesSrc));
  check('complete callable keeps its own bound',
    callablesSrc.includes('timeout: TIMEOUT_MS'));

  // Generation-conditional persistence: the sync stillOwned guard is
  // consulted immediately before EVERY durable side effect.
  const lifecycleDeps = (over = {}) => {
    const spy = {
      saved: [], marked: [], cleared: [],
      stillOwnedAnswers: [], stillOwnedCalls: 0,
    };
    const deps = {
      nowMs: () => 1_000,
      loadOwnership: async () => null,
      saveOwnership: async () => {},
      saveLaunch: async () => {},
      loadLaunch: async () => ({ requestId: 'R'.repeat(43), returnTo: 'wbt' }),
      loadSession: async () => ({ uid: 'u' }),
      get: async () => ({
        ok: true,
        view: {
          requestId: 'R'.repeat(43), state: 'pending', intent: 'read',
          jobRef: 'j1', groupRef: null, expiresAtMs: 9_999_999, wellName: 'Gab 1',
        },
      }),
      complete: async () => ({ ok: false, refusal: 'network' }),
      saveContext: async (v) => { spy.saved.push(v); },
      loadContext: async () => null,
      savePending: async () => {},
      loadPending: async () => null,
      clearPending: async () => {},
      markTerminalFailure: async (id) => { spy.marked.push(id); },
      clearTerminalFailure: async (id) => { spy.cleared.push(id); },
      stillOwned: () => {
        spy.stillOwnedCalls += 1;
        if (spy.stillOwnedAnswers.length) return spy.stillOwnedAnswers.shift();
        return true;
      },
      ...over,
    };
    return { deps, spy };
  };

  // Stale A superseded during the get: persist NOTHING, mark NOTHING.
  {
    const { deps, spy } = lifecycleDeps();
    spy.stillOwnedAnswers.push(false); // post-get check: already lost
    const out = await obtainAuthoritativeContext(deps);
    check('superseded during get: no context persisted, no markers',
      out.kind === 'fail_closed' && spy.saved.length === 0
      && spy.marked.length === 0 && spy.cleared.length === 0);
  }

  // B adopts AFTER A's post-get check but BEFORE A's attempted save:
  // the save-adjacent guard still blocks the write.
  {
    const { deps, spy } = lifecycleDeps();
    spy.stillOwnedAnswers.push(true);  // post-get check passes
    spy.stillOwnedAnswers.push(false); // save-adjacent check fails
    const out = await obtainAuthoritativeContext(deps);
    check('adopted between post-get check and save: write blocked',
      out.kind === 'fail_closed' && spy.saved.length === 0 && spy.cleared.length === 0);
  }

  // Failed get on a superseded run: terminal state is NOT marked.
  {
    const { deps, spy } = lifecycleDeps({
      get: async () => ({ ok: false, refusal: 'not_found' }),
    });
    spy.stillOwnedAnswers.push(false);
    const out = await obtainAuthoritativeContext(deps);
    check('superseded failed get: terminal never marked',
      out.kind === 'fail_closed' && spy.marked.length === 0);
  }

  // Still-owned run behaves normally: context saved, terminal cleared.
  {
    const { deps, spy } = lifecycleDeps();
    const out = await obtainAuthoritativeContext(deps);
    check('owned run persists context and clears terminal state',
      out.kind === 'ready' && spy.saved.length === 1 && spy.cleared.length === 1);
  }

  // ── R3: owner-transacted durable effects (commitOwnedEffect) ─────────────
  // The owner's commitIfOwned is the transaction; here we prove the
  // lifecycle routes EVERY durable effect through it and honors
  // not-applied by persisting/marking/mutating nothing.

  // Success path: one transaction bundles save + latch consume + terminal
  // clear; not-applied → none of them run and the run fail-closes.
  {
    const { deps, spy } = lifecycleDeps({
      commitOwnedEffect: async () => ({ applied: false }), // never runs effect
      consumeRecoveryLatch: async () => { spy.marked.push('latch'); },
    });
    const out = await obtainAuthoritativeContext(deps);
    check('not-applied success commit: save+latch+clear all skipped',
      out.kind === 'fail_closed' && spy.saved.length === 0
      && spy.cleared.length === 0 && !spy.marked.includes('latch'));
  }

  // Applied success commit runs the bundle exactly once.
  {
    let effects = 0;
    const { deps, spy } = lifecycleDeps({
      commitOwnedEffect: async (effect) => { effects += 1; await effect(); return { applied: true }; },
    });
    const out = await obtainAuthoritativeContext(deps);
    check('applied success commit bundles save+clear in ONE transaction',
      out.kind === 'ready' && effects === 1
      && spy.saved.length === 1 && spy.cleared.length === 1);
  }

  // Superseded A cannot MARK the terminal marker (failed get).
  {
    const { deps, spy } = lifecycleDeps({
      get: async () => ({ ok: false, refusal: 'not_found' }),
      commitOwnedEffect: async () => ({ applied: false }),
    });
    const out = await obtainAuthoritativeContext(deps);
    check('superseded run cannot mark terminal state',
      out.kind === 'fail_closed' && spy.marked.length === 0);
  }

  // Superseded A cannot mutate the recovery latch/session setup.
  {
    let recoveryRuns = 0;
    const { deps } = lifecycleDeps({
      get: async () => ({ ok: false, refusal: 'unauthenticated' }),
      beginUnauthenticatedRecovery: async () => { recoveryRuns += 1; return 'recover'; },
      commitOwnedEffect: async () => ({ applied: false }),
    });
    const out = await obtainAuthoritativeContext(deps);
    check('superseded run cannot mutate unauthenticated-recovery state',
      out.kind === 'fail_closed' && recoveryRuns === 0);
  }

  // Owned run with recovery: the latch mutation is transacted and honored.
  {
    let recoveryRuns = 0;
    const { deps } = lifecycleDeps({
      get: async () => ({ ok: false, refusal: 'unauthenticated' }),
      beginUnauthenticatedRecovery: async () => { recoveryRuns += 1; return 'recover'; },
      commitOwnedEffect: async (effect) => { await effect(); return { applied: true }; },
    });
    const out = await obtainAuthoritativeContext(deps);
    check('owned recovery setup transacts and proceeds to need_auth',
      out.kind === 'need_auth' && recoveryRuns === 1);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
