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
  !('wellName' in pendingDisplayFields(pendingView('read')))
  && !('driverId' in pendingDisplayFields(pendingView('read'))));

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
