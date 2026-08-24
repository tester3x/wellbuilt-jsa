/**
 * Governed Firebase Auth + bounded unauthenticated-get recovery.
 * Run: node --experimental-strip-types tools/test-jsaGovernedAuth.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validatePersistedGovernedSession,
  sanitizeSessionForPersist,
  sessionViewFromExchange,
  resolveGovernedLegalName,
  classifyExchangeLegalName,
  SESSION_FORBIDDEN_PERSIST_KEYS,
  decideStoredSessionBranch,
  isUsableGovernedSession,
  isExactUnauthenticatedCode,
  exactCallableErrorCode,
  newSessionGeneration,
  sessionGenerationOf,
  mayClearSessionGeneration,
  parseAuthRecoveryLatch,
  recoveryLatchBlocksRemint,
  decideUnauthenticatedRecoveryAction,
  shouldClearRecoveryLatch,
  installAuthDecision,
  installGovernedAuthSession,
  beginUnauthenticatedRecovery,
  resetGovernedAuthRecoveryForTests,
  createSerializedSessionMutator,
  createSerializedLatchMutator,
  classifyInitializeAuthError,
  shouldAttachRetryGeneration,
  parseGovernedTerminalFailure,
  terminalFailureMatches,
  UNAUTH_RECOVERY_OUTCOMES,
  attachRecoveryRetryGeneration,
  consumeRecoveryLatchOnSuccess,
  AUTH_RECOVERY_LATCH_TTL_MS,
  FUNCTIONS_UNAUTHENTICATED_CODE,
} from '../services/sso/jsaGovernedAuth.ts';
import {
  classifyGetError,
  classifyCallableError,
  obtainAuthoritativeContext,
  FUNCTIONS_UNAUTHENTICATED_CODE as LIFECYCLE_UNAUTH_CODE,
} from '../services/sso/jsaRequestLifecycle.ts';
import {
  handleJsaStartUrl,
  resetJsaStartOwnerForTests,
} from '../services/sso/jsaStartOwner.ts';
import {
  handleJsaSsoCallbackUrl,
  resetJsaCallbackOwnerForTests,
} from '../services/sso/jsaCallbackOwner.ts';
import {
  parseJsaSsoCallbackUrl,
  consumeCallback,
  markConsumed,
} from '../services/sso/jsaPkce.ts';
import { parseJsaLaunchUrl, isLegacyJsaLaunchUrl, buildJsaLaunchUrl } from '../services/sso/jsaLaunch.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID = 'R'.repeat(43);
const STATE = 'S'.repeat(43);
const VER = 'V'.repeat(43);
const CODE = 'c'.repeat(43);
const startUrl = buildJsaLaunchUrl({
  v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt', jobRef: 'jobDoc1',
});
const cbUrl = `jsaapp://sso-callback?v=1&status=success&code=${CODE}&state=${STATE}`;
const BINDING = { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true };

const validSession = (over = {}) => ({
  uid: 'uid-a',
  driverId: 'd1',
  companyId: 'c1',
  displayName: null,
  legalName: null,
  binding: BINDING,
  generation: '1000:aaaa',
  ...over,
});

const validPayload = (over = {}) => ({
  protocolVersion: 1,
  customToken: 'CTOKEN_SECRET',
  uid: 'uid-a',
  driverId: 'd1',
  companyId: 'c1',
  jsaBinding: BINDING,
  ...over,
});

// ── schema: parseable but invalid is not usable ───────────────────────────
check('valid session parses', !!validatePersistedGovernedSession(validSession()));
check('parseable leftover without generation is not usable',
  validatePersistedGovernedSession({
    uid: 'uid-a', driverId: 'd1', companyId: 'c1',
    displayName: null, legalName: null, binding: BINDING,
  }) === null
  && decideStoredSessionBranch({
    raw: {
      uid: 'uid-a', driverId: 'd1', companyId: 'c1',
      displayName: null, legalName: null, binding: BINDING,
    },
    authReady: true, authUid: 'uid-a',
  }) === 'need_auth');
check('partial object is not usable',
  validatePersistedGovernedSession({ uid: 'uid-a' }) === null);
check('missing UID is not usable',
  validatePersistedGovernedSession(validSession({ uid: '' })) === null);
check('parseable JSON with customToken is not usable',
  validatePersistedGovernedSession(validSession({ customToken: 'CTOKEN_SECRET' })) === null);
check('parseable JSON with idToken is not usable',
  validatePersistedGovernedSession({ ...validSession(), idToken: 'ID' }) === null);

// ── Auth readiness + usability ────────────────────────────────────────────
check('valid local session plus no Auth user is need_auth, not get',
  decideStoredSessionBranch({
    raw: validSession(), authReady: true, authUid: null,
  }) === 'need_auth'
  && isUsableGovernedSession({
    raw: validSession(), authReady: true, authUid: null,
  }) === false);
check('auth not ready is await_auth, not a false need_auth/get',
  decideStoredSessionBranch({
    raw: validSession(), authReady: false, authUid: null,
  }) === 'await_auth'
  && isUsableGovernedSession({
    raw: validSession(), authReady: false, authUid: null,
  }) === false);
check('current Auth UID mismatch is need_auth',
  decideStoredSessionBranch({
    raw: validSession(), authReady: true, authUid: 'uid-OTHER',
  }) === 'need_auth');
check('ready + matching UID is usable',
  decideStoredSessionBranch({
    raw: validSession(), authReady: true, authUid: 'uid-a',
  }) === 'usable');

{
  resetJsaStartOwnerForTests();
  let readyDone = false;
  let loadAfterReady = false;
  const deps = {
    nowMs: () => 10_000,
    isLegacy: (u) => isLegacyJsaLaunchUrl(u),
    parseLaunch: (u) => {
      const p = parseJsaLaunchUrl(u);
      return p.ok ? { ok: true, value: p.value } : { ok: false };
    },
    ownLaunch: async () => 'own',
    awaitAuthReady: async () => { readyDone = true; },
    loadSession: async () => {
      loadAfterReady = readyDone;
      return null;
    },
    loadAttempt: async () => null,
    mintAttempt: async () => ({ consumed: false, createdAtMs: 10_000 }),
    openSuite: async () => {},
    obtain: async () => ({ kind: 'ready' }),
    log: () => {},
    hasOpenedFor: () => false,
    markOpened: () => {},
  };
  await handleJsaStartUrl(startUrl, deps);
  check('Auth readiness is awaited before the usability/loadSession decision',
    readyDone && loadAfterReady);
}

// ── exchange installs Auth before persist / get ───────────────────────────
{
  const order = [];
  const persisted = [];
  const r = await installGovernedAuthSession({
    payload: validPayload(),
    legalName: null,
    generation: '2000:bbbb',
    signInWithCustomToken: async (token) => {
      order.push('signIn');
      check('customToken stays in memory for sign-in only', token === 'CTOKEN_SECRET');
      return { uid: 'uid-a' };
    },
    persist: async (session) => {
      order.push('persist');
      persisted.push(session);
    },
  });
  check('exchange success signs into Firebase Auth before persisting the sanitized session',
    r.ok === true && order.join(',') === 'signIn,persist');
  check('persisted session has no customToken or Firebase tokens',
    persisted.length === 1
    && !('customToken' in persisted[0])
    && !('idToken' in persisted[0])
    && !('refreshToken' in persisted[0])
    && persisted[0].uid === 'uid-a'
    && persisted[0].generation === '2000:bbbb');
}

{
  let persisted = 0;
  const r = await installGovernedAuthSession({
    payload: validPayload(),
    legalName: null,
    generation: '2000:bbbb',
    signInWithCustomToken: async () => ({ uid: 'uid-OTHER' }),
    persist: async () => { persisted += 1; },
  });
  check('signed-in UID mismatch fails closed and does not persist',
    r.ok === false && r.reason === 'uid_mismatch' && persisted === 0
    && installAuthDecision({ signedInUid: 'uid-OTHER', expectedUid: 'uid-a' }) === 'fail_closed');
}

{
  let persisted = 0;
  const r = await installGovernedAuthSession({
    payload: validPayload(),
    legalName: null,
    generation: '2000:bbbb',
    signInWithCustomToken: async () => null,
    persist: async () => { persisted += 1; },
  });
  check('no signInWithCustomToken means no persisted session',
    r.ok === false && persisted === 0);
  check('no Auth user keeps protected get unauthenticated / need_auth',
    decideStoredSessionBranch({
      raw: validSession(), authReady: true, authUid: null,
    }) === 'need_auth'
    && isExactUnauthenticatedCode({ code: 'functions/unauthenticated' }));
}

check('sessionFromExchange never copies customToken onto the application session',
  !('customToken' in sessionViewFromExchange(validPayload(), null, 'g1')));
check('sanitize drops any extra token field if a caller stuffed one',
  !('customToken' in sanitizeSessionForPersist(validSession()))
  && SESSION_FORBIDDEN_PERSIST_KEYS.includes('customToken'));

// ── authenticated exchange legalName: absent / valid / present-invalid ────
{
  const sessionSrc = readFileSync(join(root, 'services/sso/jsaSession.ts'), 'utf8');
  const livePersist = readFileSync(join(root, 'services/sso/jsaGovernedAuthLive.ts'), 'utf8');
  const callbackLive = readFileSync(join(root, 'services/sso/jsaCallbackLive.ts'), 'utf8');
  check('validateExchangePayload uses own-property classification',
    sessionSrc.includes('classifyExchangeLegalName(o, displayName)')
    && sessionSrc.includes("classified.kind === 'invalid'")
    && /if \(classified\.kind === 'invalid'\) return null/.test(sessionSrc));
  check('live persistAfterExchange uses payload.legalName, never hardcodes null',
    /legalName:\s*payload\.legalName\s*\?\?\s*null/.test(livePersist)
    && !/legalName:\s*null/.test(livePersist));
  check('callback validates the exchange before persistAfterExchange',
    callbackLive.includes('validateExchangePayload')
    && callbackLive.includes('persistAfterExchange')
    && callbackLive.indexOf('validateExchangePayload') < callbackLive.indexOf('persistAfterExchange'));

  const base = validPayload({ displayName: 'Mikezfold' });
  check('absent legalName is accepted',
    classifyExchangeLegalName(base, 'Mikezfold').kind === 'absent');
  check('present valid legalName is accepted and normalized',
    JSON.stringify(classifyExchangeLegalName(
      { ...base, legalName: '  Michael S Burger  ' }, 'Mikezfold',
    )) === JSON.stringify({ kind: 'ok', value: 'Michael S Burger' }));

  const presentInvalid = [
    ['null', { ...base, legalName: null }],
    ['undefined own-property', { ...base, legalName: undefined }],
    ['boolean', { ...base, legalName: true }],
    ['number', { ...base, legalName: 42 }],
    ['object', { ...base, legalName: { name: 'Michael' } }],
    ['array', { ...base, legalName: ['Michael'] }],
    ['empty string', { ...base, legalName: '' }],
    ['whitespace-only', { ...base, legalName: '   ' }],
    ['over 64 characters', { ...base, legalName: 'x'.repeat(65) }],
    ['control characters', { ...base, legalName: `Michael${String.fromCharCode(0)}` }],
    ['indistinguishable from displayName', { ...base, legalName: 'Mikezfold' }],
    ['displayName case-insensitive', { ...base, legalName: 'mikezfold' }],
  ];
  for (const [label, payload] of presentInvalid) {
    check(`present-invalid legalName (${label}) rejects the exchange`,
      classifyExchangeLegalName(payload, 'Mikezfold').kind === 'invalid');
  }

  check('distinct legalName is accepted after trim',
    resolveGovernedLegalName('  Michael S Burger  ', 'Mikezfold') === 'Michael S Burger');
  check('resolver still never copies displayName',
    resolveGovernedLegalName('Mikezfold', 'Mikezfold') === null
    && resolveGovernedLegalName(null, 'Mikezfold') === null);

  const persisted = [];
  const installed = await installGovernedAuthSession({
    payload: validPayload({ displayName: 'Mikezfold', legalName: '  Michael S Burger  ' }),
    legalName: '  Michael S Burger  ',
    generation: '3000:cccc',
    signInWithCustomToken: async () => ({ uid: 'uid-a' }),
    persist: async (session) => { persisted.push(session); },
  });
  const reloaded = validatePersistedGovernedSession(persisted[0]);
  check('authenticated legalName is persisted on the sanitized session',
    installed.ok === true
    && persisted[0].legalName === 'Michael S Burger'
    && persisted[0].displayName === 'Mikezfold'
    && !('customToken' in persisted[0]));
  check('reloaded session still carries the authenticated legalName',
    reloaded?.legalName === 'Michael S Burger'
    && reloaded?.displayName === 'Mikezfold'
    && reloaded?.legalName !== reloaded?.displayName);

  const missingPersisted = [];
  await installGovernedAuthSession({
    payload: validPayload({ displayName: 'Mikezfold' }),
    legalName: null,
    generation: '3000:dddd',
    signInWithCustomToken: async () => ({ uid: 'uid-a' }),
    persist: async (session) => { missingPersisted.push(session); },
  });
  const missingReloaded = validatePersistedGovernedSession(missingPersisted[0]);
  check('absent legalName persists as null and is not substituted from displayName',
    missingReloaded?.legalName === null
    && missingReloaded?.displayName === 'Mikezfold');

  let persistCalls = 0;
  const existing = validSession({ legalName: 'Michael S Burger', generation: 'keep-me' });
  const invalidClass = classifyExchangeLegalName(
    { ...base, legalName: '' }, 'Mikezfold',
  );
  if (invalidClass.kind !== 'invalid') persistCalls += 1;
  check('present-invalid payload creates no session and does not replace an existing one',
    invalidClass.kind === 'invalid'
    && persistCalls === 0
    && existing.legalName === 'Michael S Burger'
    && existing.generation === 'keep-me');

  const scanLegal = [
    'services/sso/jsaSession.ts',
    'services/sso/jsaGovernedAuth.ts',
    'services/sso/jsaGovernedAuthLive.ts',
  ];
  const legalLogs = [];
  for (const f of scanLegal) {
    const src = readFileSync(join(root, f), 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
      if (!/console\.(log|warn|error|info|debug)\(/.test(line)) return;
      const args = /console\.(log|warn|error|info|debug)\((.*)$/.exec(line)?.[2] || '';
      const withoutStrings = args.replace(/'[^']*'|"[^"]*"|`[^`$]*`/g, '');
      if (/\blegalName\b/.test(withoutStrings)) legalLogs.push(`${f}:${i + 1}`);
    });
  }
  check('authorized legalName files never log legalName', legalLogs.length === 0, legalLogs.join(', '));
}

// ── exact unauthenticated classification ──────────────────────────────────
check('lifecycle and auth modules share the exact callable code',
  LIFECYCLE_UNAUTH_CODE === FUNCTIONS_UNAUTHENTICATED_CODE
  && FUNCTIONS_UNAUTHENTICATED_CODE === 'functions/unauthenticated');
check('exact functions/unauthenticated classifies as unauthenticated',
  classifyGetError({ code: 'functions/unauthenticated' }) === 'unauthenticated'
  && isExactUnauthenticatedCode({ code: 'functions/unauthenticated' }));
check('blob/string unauthenticated is not the recovery classification',
  classifyGetError({ message: 'unauthenticated' }) !== 'unauthenticated'
  && classifyCallableError({ code: 'functions/internal', message: 'unauthenticated' }) !== 'unauthenticated'
  && !isExactUnauthenticatedCode({ message: 'unauthenticated' })
  && exactCallableErrorCode({ code: 'functions/permission-denied' }) === 'functions/permission-denied');

// ── one-shot recovery + non-unauth errors ─────────────────────────────────
function obtainMem(over = {}) {
  const store = {
    launch: { v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt' },
    session: validSession(),
    ctx: null,
    pending: null,
    own: { request: { requestId: RID, returnTo: 'wbt' }, receivedAtMs: 1 },
    recoveries: 0,
    gets: 0,
    getRefusal: null,
    ...over.store,
  };
  const deps = {
    nowMs: () => 10_000,
    loadOwnership: async () => store.own,
    saveOwnership: async (o) => { store.own = o; },
    saveLaunch: async (r) => { store.launch = r; },
    loadLaunch: async () => store.launch,
    loadSession: async () => store.session,
    awaitAuthReady: async () => { store.authAwaited = true; },
    beginUnauthenticatedRecovery: async () => {
      store.recoveries += 1;
      return 'recover';
    },
    get: async () => {
      store.gets += 1;
      if (store.getRefusal) return { ok: false, refusal: store.getRefusal };
      return {
        ok: true,
        view: {
          requestId: RID, state: 'pending', intent: 'read',
          jobRef: 'server-job', groupRef: null,
        },
      };
    },
    complete: async () => ({ ok: false, refusal: 'complete_failed' }),
    saveContext: async (v) => { store.ctx = v; },
    loadContext: async () => store.ctx,
    savePending: async () => {},
    loadPending: async () => store.pending,
    clearPending: async () => { store.pending = null; },
    ...over.deps,
  };
  return { store, deps };
}

{
  const { store, deps } = obtainMem();
  store.getRefusal = 'unauthenticated';
  const r = await obtainAuthoritativeContext(deps);
  check('explicit unauthenticated get starts one recovery (need_auth, not get-ready)',
    r.kind === 'need_auth' && store.recoveries === 1 && store.gets === 1 && store.authAwaited === true);
  check('recovery preserves launch ownership',
    store.own.request.requestId === RID && store.launch.requestId === RID);
}

{
  const cases = [
    ['network', { code: 'functions/unavailable', message: 'failed to fetch' }],
    ['permission', { code: 'functions/permission-denied', details: { refusal: 'wrong_audience' } }],
    ['not-found', { code: 'functions/failed-precondition', details: { refusal: 'not_found' } }],
    ['binding', { details: { refusal: 'binding_mismatch' } }],
    ['expiry', { message: 'expired' }],
    ['generic', { code: 'functions/internal', message: 'boom' }],
  ];
  let all = true;
  for (const [name, err] of cases) {
    const refusal = name === 'permission'
      ? classifyCallableError(err)
      : classifyGetError(err);
    const { store, deps } = obtainMem();
    store.getRefusal = refusal;
    const before = store.session;
    const r = await obtainAuthoritativeContext(deps);
    const ok = r.kind === 'fail_closed'
      && store.recoveries === 0
      && store.session === before
      && refusal !== 'unauthenticated';
    if (!ok) all = false;
    check(`${name} error does not recover or classify as unauthenticated`,
      ok, `refusal=${refusal} kind=${r.kind} recoveries=${store.recoveries}`);
  }
  check('network/permission/not-found/binding/expiry/generic do not clear or open Suite', all);
}

// ── generation: late A cannot delete B ────────────────────────────────────
check('generation identity is local and unique per mint',
  newSessionGeneration(1, 'aa') !== newSessionGeneration(1, 'bb')
  && sessionGenerationOf(validSession({ generation: '1:aa' })) === '1:aa');
check('late failure using session A cannot delete session B',
  mayClearSessionGeneration({ usedGeneration: 'A', currentGeneration: 'B' }) === false
  && mayClearSessionGeneration({ usedGeneration: 'A', currentGeneration: 'A' }) === true);

{
  resetGovernedAuthRecoveryForTests();
  const store = {
    latch: null,
    session: validSession({ generation: 'A' }),
    attempt: null,
    minted: 0,
    cleared: [],
    signedOut: 0,
  };
  const first = await beginUnauthenticatedRecovery({
    nowMs: () => 10_000,
    loadLatch: async () => store.latch,
    saveLatch: async (l) => { store.latch = l; },
    loadAttempt: async () => store.attempt,
    mintAttempt: async () => {
      store.minted += 1;
      store.attempt = { state: STATE, createdAtMs: 10_000, consumed: false };
      return store.attempt;
    },
    usedGeneration: 'A',
    currentGeneration: async () => store.session?.generation ?? null,
    clearIfGeneration: async (g) => {
      if (store.session?.generation === g) {
        store.cleared.push(g);
        store.session = validSession({ generation: 'B', uid: 'uid-b' });
      }
    },
    reconcileAuth: async () => { store.signedOut += 1; },
  });
  // Simulate session B installed before the late clear of A:
  store.session = validSession({ generation: 'B', uid: 'uid-b' });
  const lateClear = mayClearSessionGeneration({
    usedGeneration: 'A',
    currentGeneration: store.session.generation,
  });
  check('recovery mints an attempt-keyed latch and would not late-delete B',
    first === 'recover'
    && store.minted === 1
    && store.latch.phase === 'recovering'
    && store.latch.state === STATE
    && store.latch.failedGeneration === 'A'
    && lateClear === false);
}

function recovDeps(store, usedGeneration) {
  return {
    nowMs: () => 10_100,
    loadLatch: async () => store.latch,
    saveLatch: async (l) => { store.latch = l; },
    loadAttempt: async () => store.attempt,
    mintAttempt: async () => {
      store.minted += 1;
      store.attempt = { state: STATE, createdAtMs: 10_000, consumed: false };
      return store.attempt;
    },
    usedGeneration,
    currentGeneration: async () => store.session?.generation ?? null,
    clearIfGeneration: async (g) => {
      if (store.session?.generation === g) store.session = null;
    },
    reconcileAuth: async () => { store.signedOut = (store.signedOut || 0) + 1; },
  };
}

{
  resetGovernedAuthRecoveryForTests();
  const store = {
    latch: null,
    session: validSession({ generation: 'A' }),
    attempt: null,
    minted: 0,
    signedOut: 0,
  };
  const first = await beginUnauthenticatedRecovery(recovDeps(store, 'A'));
  resetGovernedAuthRecoveryForTests();
  const dupA = await beginUnauthenticatedRecovery(recovDeps(store, 'A'));
  check('duplicate A unauthenticated joins one recovery and does not exhaust',
    first === 'recover' && dupA === 'join'
    && store.latch.phase === 'recovering'
    && store.minted === 1);

  resetGovernedAuthRecoveryForTests();
  store.latch.retryGeneration = 'B';
  store.session = validSession({ generation: 'B' });
  const retryB = await beginUnauthenticatedRecovery(recovDeps(store, 'B'));
  check('only failed retry B exhausts the latch',
    retryB === 'fail_closed' && store.latch.phase === 'exhausted' && store.minted === 1);
  check('in-window exhausted latch blocks remint; requestId is not the latch key',
    recoveryLatchBlocksRemint(store.latch, 10_100) === true
    && !('requestId' in store.latch)
    && AUTH_RECOVERY_LATCH_TTL_MS === 180_000);
  check('expired latch (after existing attempt TTL) no longer blocks a new mint',
    recoveryLatchBlocksRemint(store.latch, 10_000 + AUTH_RECOVERY_LATCH_TTL_MS + 1) === false);
}

check('non-unauthenticated decide does not recover',
  decideUnauthenticatedRecoveryAction({
    exactUnauthenticated: false, latch: null, nowMs: 1, usedGeneration: 'A',
  }) === 'not_unauthenticated');
check('parse latch rejects garbage',
  parseAuthRecoveryLatch({ state: STATE }) === null);

// ── start owner: exhausted latch fail-closes without second Suite ─────────
{
  resetJsaStartOwnerForTests();
  let suiteOpens = 0;
  const deps = {
    nowMs: () => 10_000,
    isLegacy: (u) => isLegacyJsaLaunchUrl(u),
    parseLaunch: (u) => {
      const p = parseJsaLaunchUrl(u);
      return p.ok ? { ok: true, value: p.value } : { ok: false };
    },
    ownLaunch: async () => 'own',
    loadSession: async () => null,
    loadAttempt: async () => null,
    mintAttempt: async () => ({ consumed: false, createdAtMs: 10_000, state: STATE }),
    openSuite: async () => { suiteOpens += 1; },
    obtain: async () => ({ kind: 'ready' }),
    log: () => {},
    hasOpenedFor: () => false,
    markOpened: () => {},
    loadRecoveryLatch: async () => ({
      state: STATE, createdAtMs: 9990, usedAtMs: 9990, phase: 'exhausted',
    }),
  };
  const r = await handleJsaStartUrl(startUrl, deps);
  check('retry failure terminates without a second recovery Suite loop',
    r.kind === 'fail_closed' && r.refusal === 'unauthenticated' && suiteOpens === 0);
}

// ── full one-shot chain: one Suite, one exchange, one Auth, one retry get ─
{
  resetJsaStartOwnerForTests();
  resetJsaCallbackOwnerForTests();
  const store = {
    session: validSession(),
    attempt: null,
    latch: null,
    ownershipAction: 'own',
    suiteOpens: 0,
    exchanged: 0,
    signedIn: 0,
    persisted: 0,
    gets: 0,
    obtains: 0,
    recoveries: 0,
    getWave: 0,
  };
  const startDeps = {
    nowMs: () => 10_000,
    isLegacy: (u) => isLegacyJsaLaunchUrl(u),
    parseLaunch: (u) => {
      const p = parseJsaLaunchUrl(u);
      return p.ok ? { ok: true, value: p.value } : { ok: false };
    },
    ownLaunch: async () => store.ownershipAction,
    loadSession: async () => (
      store.session
      && isUsableGovernedSession({ raw: store.session, authReady: true, authUid: store.session.uid })
        ? store.session
        : null
    ),
    loadAttempt: async () => store.attempt,
    mintAttempt: async () => {
      store.attempt = { state: STATE, verifier: VER, createdAtMs: 10_000, consumed: false };
      return store.attempt;
    },
    openSuite: async () => { store.suiteOpens += 1; },
    obtain: async () => {
      store.obtains += 1;
      store.gets += 1;
      store.getWave += 1;
      if (store.getWave === 1) {
        const rec = await beginUnauthenticatedRecovery({
          nowMs: () => 10_000,
          loadLatch: async () => store.latch,
          saveLatch: async (l) => { store.latch = l; },
          loadAttempt: async () => store.attempt,
          mintAttempt: async () => {
            store.attempt = { state: STATE, verifier: VER, createdAtMs: 10_000, consumed: false };
            return store.attempt;
          },
          usedGeneration: store.session?.generation ?? null,
          currentGeneration: async () => store.session?.generation ?? null,
          clearIfGeneration: async (g) => {
            if (store.session?.generation === g) store.session = null;
          },
          reconcileAuth: async () => {},
        });
        store.recoveries += rec === 'recover' ? 1 : 0;
        return rec === 'recover'
          ? { kind: 'need_auth' }
          : { kind: 'fail_closed', refusal: 'unauthenticated' };
      }
      return { kind: 'ready' };
    },
    log: () => {},
    hasOpenedFor: (id) => store.opened?.has(id),
    markOpened: (id) => {
      store.opened = store.opened || new Set();
      store.opened.add(id);
    },
    loadRecoveryLatch: async () => store.latch,
    awaitAuthReady: async () => {},
  };
  const first = await handleJsaStartUrl(startUrl, startDeps);
  check('unauthenticated get produces one Suite authorization',
    first.kind === 'need_auth' && store.suiteOpens === 1 && store.recoveries === 1);

  const cbDeps = {
    nowMs: () => 10_000,
    parseUrl: (u) => parseJsaSsoCallbackUrl(u),
    loadAttempt: async () => store.attempt,
    consume: (a, p, n) => consumeCallback(a, p, n),
    markConsumed,
    saveAttempt: async (a) => { store.attempt = a; },
    clearAttempt: async () => { store.attempt = store.attempt ? { ...store.attempt, consumed: true } : null; },
    exchange: async () => {
      store.exchanged += 1;
      return validPayload();
    },
    saveSession: async (payload) => {
      const installed = await installGovernedAuthSession({
        payload,
        legalName: null,
        generation: '3000:cccc',
        signInWithCustomToken: async () => {
          store.signedIn += 1;
          return { uid: 'uid-a' };
        },
        persist: async (session) => {
          store.persisted += 1;
          store.session = session;
        },
      });
      if (!installed.ok) throw new Error(installed.reason);
    },
    loadSession: async () => store.session,
    obtainAfterSession: async () => {
      store.obtains += 1;
      store.gets += 1;
    },
  };
  const exchanged = await handleJsaSsoCallbackUrl(cbUrl, cbDeps);
  check('one exchange, one Auth installation, one get retry after Suite',
    exchanged.kind === 'exchanged'
    && store.exchanged === 1
    && store.signedIn === 1
    && store.persisted === 1
    && store.gets === 2
    && store.suiteOpens === 1);

  resetJsaStartOwnerForTests();
  store.latch = { ...store.latch, phase: 'exhausted' };
  store.session = null;
  const again = await handleJsaStartUrl(startUrl, startDeps);
  check('after retry failure / exhausted latch, no second Suite or exchange',
    again.kind === 'fail_closed' && store.suiteOpens === 1 && store.exchanged === 1);
}

// ── duplicate /start + callback still one chain ───────────────────────────
{
  resetJsaStartOwnerForTests();
  resetJsaCallbackOwnerForTests();
  const store = {
    session: null,
    attempt: null,
    suiteOpens: 0,
    exchanged: 0,
    obtained: 0,
    opened: new Set(),
  };
  const startDeps = {
    nowMs: () => 10_000,
    isLegacy: (u) => isLegacyJsaLaunchUrl(u),
    parseLaunch: (u) => {
      const p = parseJsaLaunchUrl(u);
      return p.ok ? { ok: true, value: p.value } : { ok: false };
    },
    ownLaunch: async () => 'own',
    loadSession: async () => store.session,
    loadAttempt: async () => store.attempt,
    mintAttempt: async () => {
      store.attempt = { state: STATE, verifier: VER, createdAtMs: 10_000, consumed: false };
      return store.attempt;
    },
    openSuite: async () => { store.suiteOpens += 1; },
    obtain: async () => ({ kind: 'ready' }),
    log: () => {},
    hasOpenedFor: (id) => store.opened.has(id),
    markOpened: (id) => { store.opened.add(id); },
  };
  await handleJsaStartUrl(startUrl, startDeps);
  resetJsaStartOwnerForTests();
  await handleJsaStartUrl(startUrl, startDeps);
  const first = handleJsaStartUrl(startUrl, startDeps);
  const second = handleJsaStartUrl(startUrl, startDeps);
  await Promise.all([first, second]);
  check('duplicate /start + in-flight deliveries still one Suite',
    store.suiteOpens === 1);

  const cbDeps = {
    nowMs: () => 10_000,
    parseUrl: (u) => parseJsaSsoCallbackUrl(u),
    loadAttempt: async () => store.attempt,
    consume: (a, p, n) => consumeCallback(a, p, n),
    markConsumed,
    saveAttempt: async (a) => { store.attempt = a; },
    clearAttempt: async () => { store.attempt = { ...store.attempt, consumed: true }; },
    exchange: async () => {
      store.exchanged += 1;
      return validPayload();
    },
    saveSession: async () => {
      store.session = validSession({ generation: '4000:dddd' });
    },
    loadSession: async () => store.session,
    obtainAfterSession: async () => { store.obtained += 1; },
  };
  const a = handleJsaSsoCallbackUrl(cbUrl, cbDeps);
  const b = handleJsaSsoCallbackUrl(cbUrl, cbDeps);
  await Promise.all([a, b]);
  resetJsaCallbackOwnerForTests();
  await handleJsaSsoCallbackUrl(cbUrl, cbDeps);
  check('duplicate callback / Linking-style redelivery still one exchange/Auth/get',
    store.exchanged === 1 && store.obtained >= 1);
}

// ── complete is not given new reauthorization ─────────────────────────────
const lifecycleSrc = readFileSync(join(root, 'services/sso/jsaRequestLifecycle.ts'), 'utf8');
check('completeAfterLocalSave is not wired to unauthenticated recovery',
  !/completeAfterLocalSave[\s\S]{0,800}beginUnauthenticatedRecovery/.test(lifecycleSrc));
const completeSrc = readFileSync(join(root, 'services/sso/jsaRequestCallables.ts'), 'utf8');
check('jsaCompleteReadRequest has no new reauthorization / signIn',
  !completeSrc.includes('signInWithCustomToken')
  && !completeSrc.includes('beginUnauthenticatedRecovery'));

// ── serialized session A/B mutations ──────────────────────────────────────
{
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  async function raceOrder(firstIsClear) {
    let mem = validSession({ generation: 'A' });
    const mut = createSerializedSessionMutator({
      load: async () => mem,
      save: async (s) => { await delay(8); mem = s; },
      clear: async () => { await delay(8); mem = null; },
    });
    const clearA = () => mut.clearIfGeneration('A');
    const saveB = () => mut.save(validSession({ generation: 'B', uid: 'uid-b' }));
    if (firstIsClear) await Promise.all([clearA(), saveB()]);
    else await Promise.all([saveB(), clearA()]);
    return mem;
  }
  const afterClearFirst = await raceOrder(true);
  const afterSaveFirst = await raceOrder(false);
  check('clear A before save B leaves B (serialized)', afterClearFirst?.generation === 'B');
  check('save B before clear A leaves B (serialized)', afterSaveFirst?.generation === 'B');
  let onlyA = validSession({ generation: 'A' });
  const mutA = createSerializedSessionMutator({
    load: async () => onlyA,
    save: async (s) => { onlyA = s; },
    clear: async () => { onlyA = null; },
  });
  await mutA.clearIfGeneration('A');
  check('clear A with no intervening B removes only A', onlyA === null);
}

// ── concurrent duplicate A joins one flight ───────────────────────────────
{
  resetGovernedAuthRecoveryForTests();
  const store = {
    latch: null, session: validSession({ generation: 'A' }),
    attempt: null, minted: 0, starts: 0,
  };
  const deps = recovDeps(store, 'A');
  const origMint = deps.mintAttempt;
  deps.mintAttempt = async () => {
    store.starts += 1;
    await new Promise((r) => setTimeout(r, 15));
    return origMint();
  };
  const [x, y] = await Promise.all([
    beginUnauthenticatedRecovery(deps),
    beginUnauthenticatedRecovery(deps),
  ]);
  check('concurrent recovery callers share one flight and one mint',
    store.minted === 1 && store.starts === 1
    && [x, y].every((k) => k === 'recover' || k === 'join')
    && [x, y].includes('recover'));
}

// ── live-dependency: A fail → recover → B success clears latch ───────────
{
  resetGovernedAuthRecoveryForTests();
  const store = {
    launch: { v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt' },
    session: validSession({ generation: 'A' }),
    latch: null,
    attempt: null,
    ctx: null,
    pending: null,
    own: { request: { requestId: RID, returnTo: 'wbt' }, receivedAtMs: 1 },
    wave: 0,
    recoveries: 0,
  };
  const recov = recovDeps(store, 'A');
  recov.usedGeneration = 'A';
  const deps = {
    nowMs: () => 10_000,
    loadOwnership: async () => store.own,
    saveOwnership: async (o) => { store.own = o; },
    saveLaunch: async (r) => { store.launch = r; },
    loadLaunch: async () => store.launch,
    loadSession: async () => store.session,
    awaitAuthReady: async () => {},
    beginUnauthenticatedRecovery: async (session) => {
      recov.usedGeneration = sessionGenerationOf(session);
      store.recoveries += 1;
      return beginUnauthenticatedRecovery(recov);
    },
    consumeRecoveryLatch: async (session) => {
      const consumed = await consumeRecoveryLatchOnSuccess({
        nowMs: () => 10_000,
        loadLatch: async () => store.latch,
        clearLatch: async () => { store.latch = null; },
        sessionGeneration: sessionGenerationOf(session),
        attemptState: store.attempt?.state ?? null,
      });
      return consumed ? 'applied' : 'not_applicable';
    },
    get: async () => {
      store.wave += 1;
      if (store.wave === 1) return { ok: false, refusal: 'unauthenticated' };
      return {
        ok: true,
        view: {
          requestId: RID, state: 'pending', intent: 'read',
          jobRef: 'server-job', groupRef: null,
        },
      };
    },
    complete: async () => ({ ok: false, refusal: 'complete_failed' }),
    saveContext: async (v) => { store.ctx = v; },
    loadContext: async () => store.ctx,
    savePending: async () => {},
    loadPending: async () => store.pending,
    clearPending: async () => { store.pending = null; },
  };
  const first = await obtainAuthoritativeContext(deps);
  check('A fail starts recovery', first.kind === 'need_auth' && store.latch?.phase === 'recovering');
  await attachRecoveryRetryGeneration({
    loadLatch: async () => store.latch,
    saveLatch: async (l) => { store.latch = l; },
    expectedState: STATE,
    expectedCreatedAtMs: 10_000,
    retryGeneration: 'B',
  });
  store.session = validSession({ generation: 'B' });
  resetGovernedAuthRecoveryForTests();
  const second = await obtainAuthoritativeContext(deps);
  check('successful retry B clears the matching latch',
    second.kind === 'ready' && store.latch === null);
  store.session = validSession({ generation: 'C', uid: 'uid-c' });
  store.wave = 0;
  resetGovernedAuthRecoveryForTests();
  const later = await obtainAuthoritativeContext({
    ...deps,
    get: async () => ({ ok: false, refusal: 'unauthenticated' }),
  });
  check('later unrelated request remains eligible for its own bounded recovery',
    later.kind === 'need_auth' && store.latch?.phase === 'recovering'
    && store.latch.failedGeneration === 'C');
}

// ── persist-after-sign-in failure cleans Auth and own generation ──────────
{
  let signedOut = 0;
  let persisted = [];
  const r = await installGovernedAuthSession({
    payload: validPayload(),
    legalName: null,
    generation: 'G1',
    signInWithCustomToken: async () => ({ uid: 'uid-a' }),
    persist: async (session) => {
      persisted.push(session.generation);
      throw new Error('disk');
    },
    reconcileAuth: async () => { signedOut += 1; },
    clearIfGeneration: async (g) => {
      persisted = persisted.filter((x) => x !== g);
    },
  });
  check('persist-after-sign-in failure signs out and removes only its generation',
    r.ok === false && r.reason === 'persist_failed' && signedOut === 1 && persisted.length === 0);
}

check('already-initialized Auth error is the only init fallback',
  classifyInitializeAuthError({ code: 'auth/already-initialized' }) === 'already_initialized'
  && classifyInitializeAuthError({ code: 'auth/internal-error' }) === 'fail_closed'
  && classifyInitializeAuthError(new Error('rn_auth_persistence_unavailable')) === 'fail_closed');
const liveInit = readFileSync(join(root, 'services/sso/jsaGovernedAuthLive.ts'), 'utf8');
check('live Auth init fails closed unless already-initialized',
  liveInit.includes('classifyInitializeAuthError')
  && liveInit.includes("=== 'already_initialized'")
  && !/catch \{[\s\S]{0,80}getAuth/.test(liveInit));

check('unrelated attempt success does not clear another latch',
  shouldClearRecoveryLatch({
    latch: {
      state: STATE, createdAtMs: 1, usedAtMs: 1, phase: 'recovering',
      failedGeneration: 'A', retryGeneration: 'B',
    },
    nowMs: 2,
    sessionGeneration: 'OTHER',
    attemptState: 'DIFFERENT',
    attemptCreatedAtMs: 99,
  }) === false
  && shouldClearRecoveryLatch({
    latch: {
      state: STATE, createdAtMs: 1, usedAtMs: 1, phase: 'recovering',
      failedGeneration: 'A', retryGeneration: 'B',
    },
    nowMs: 2,
    sessionGeneration: 'B',
    attemptState: STATE,
    attemptCreatedAtMs: 1,
  }) === true);

check('live recovery wrapper includes join in the shared outcome union',
  UNAUTH_RECOVERY_OUTCOMES.includes('join')
  && readFileSync(join(root, 'services/sso/jsaGovernedAuthLive.ts'), 'utf8').includes('UnauthRecoveryOutcome')
  && readFileSync(join(root, 'services/sso/jsaGovernedLive.ts'), 'utf8').includes('liveBeginMatchesEntryDeps'));

{
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const oldL = {
    state: STATE, createdAtMs: 1, usedAtMs: 1, phase: 'recovering',
    failedGeneration: 'A', retryGeneration: 'B',
  };
  const newL = {
    state: 'NEWSTATE', createdAtMs: 9, usedAtMs: 9, phase: 'recovering',
    failedGeneration: 'C', retryGeneration: null,
  };
  async function raceConsumeVsSave(firstConsume) {
    let mem = oldL;
    const mut = createSerializedLatchMutator({
      load: async () => mem,
      save: async (l) => { await delay(8); mem = l; },
      clear: async () => { await delay(8); mem = null; },
    });
    const consumeOld = () => mut.consumeIfMatching({
      nowMs: 2, sessionGeneration: 'B', attemptState: STATE, attemptCreatedAtMs: 1,
    });
    const saveNew = () => mut.save(newL);
    if (firstConsume) await Promise.all([consumeOld(), saveNew()]);
    else await Promise.all([saveNew(), consumeOld()]);
    return mem;
  }
  const a = await raceConsumeVsSave(true);
  const b = await raceConsumeVsSave(false);
  check('old latch success cannot clear a newer latch (consume then save)',
    a && a.state === 'NEWSTATE');
  check('old latch success cannot clear a newer latch (save then consume)',
    b && b.state === 'NEWSTATE');
}

{
  let mem = {
    state: 'NEWSTATE', createdAtMs: 9, usedAtMs: 9, phase: 'recovering',
    failedGeneration: 'C', retryGeneration: null,
  };
  const attached = await attachRecoveryRetryGeneration({
    loadLatch: async () => mem,
    saveLatch: async (l) => { mem = l; },
    expectedState: STATE,
    expectedCreatedAtMs: 1,
    retryGeneration: 'OLDGEN',
  });
  check('old callback cannot attach retry generation to a newer latch',
    attached === false && mem.retryGeneration === null
    && shouldAttachRetryGeneration({
      latch: mem, expectedState: STATE, expectedCreatedAtMs: 1,
    }) === false);
}

{
  const markerA = parseGovernedTerminalFailure({ requestId: RID });
  const markerB = parseGovernedTerminalFailure({ requestId: 'S'.repeat(43) });
  check('terminal failure is request-scoped',
    terminalFailureMatches(markerA, RID) === true
    && terminalFailureMatches(markerA, 'S'.repeat(43)) === false
    && terminalFailureMatches(markerB, RID) === false);
  check('Auth/session installation alone does not clear terminal failure',
    !readFileSync(join(root, 'services/sso/jsaGovernedAuthLive.ts'), 'utf8')
      .includes('clearGovernedTerminalFailure()'));
  check('matching authoritative get success clears terminal failure',
    readFileSync(join(root, 'services/sso/jsaRequestLifecycle.ts'), 'utf8')
      .includes('clearTerminalFailure')
    && readFileSync(join(root, 'services/sso/jsaRequestLifecycle.ts'), 'utf8')
      .includes('await deps.clearTerminalFailure(launch.requestId)'));
}

{
  let signedOut = 0;
  let cleared = 0;
  const r1 = await installGovernedAuthSession({
    payload: validPayload(),
    legalName: null,
    generation: 'G1',
    signInWithCustomToken: async () => ({ uid: 'uid-a' }),
    persist: async () => { throw new Error('disk'); },
    reconcileAuth: async () => { throw new Error('signout'); },
    clearIfGeneration: async () => { cleared += 1; },
  });
  const r2 = await installGovernedAuthSession({
    payload: validPayload(),
    legalName: null,
    generation: 'G2',
    signInWithCustomToken: async () => ({ uid: 'uid-a' }),
    persist: async () => { throw new Error('disk'); },
    reconcileAuth: async () => { signedOut += 1; },
    clearIfGeneration: async () => { throw new Error('clear'); },
  });
  check('sign-out failure still runs generation-conditional cleanup',
    r1.ok === false && cleared === 1);
  check('conditional-clear failure still runs sign-out and stays fail-closed',
    r2.ok === false && signedOut === 1);
}

// ── tokens never persisted or logged ──────────────────────────────────────
const scanFiles = [
  'services/sso/jsaGovernedAuth.ts',
  'services/sso/jsaGovernedAuthLive.ts',
  'services/sso/jsaSession.ts',
  'services/sso/jsaRuntime.ts',
  'services/sso/jsaCallbackLive.ts',
  'services/sso/jsaStartLive.ts',
  'services/sso/jsaStartOwner.ts',
  'services/sso/jsaCallbackOwner.ts',
];
let leak = [];
for (const f of scanFiles) {
  const src = readFileSync(join(root, f), 'utf8');
  src.split(/\r?\n/).forEach((line, i) => {
    if (!/console\.(log|warn|error|info|debug)\(/.test(line)) return;
    if (/\b(customToken|idToken|refreshToken|codeVerifier|verifier)\b/.test(line)
      && !/'[^']*'|"[^"]*"/.test(line.replace(/\b(customToken|idToken|refreshToken|codeVerifier|verifier)\b/, ''))) {
      leak.push(`${f}:${i + 1}`);
    }
    const args = /console\.(log|warn|error|info|debug)\((.*)$/.exec(line)?.[2] || '';
    const withoutStrings = args.replace(/'[^']*'|"[^"]*"|`[^`$]*`/g, '');
    if (/\b(customToken|idToken|refreshToken|codeVerifier)\b/.test(withoutStrings)) {
      leak.push(`${f}:${i + 1}`);
    }
  });
}
check('custom token and Firebase tokens are never logged', leak.length === 0, leak.join(', '));

const liveAuth = readFileSync(join(root, 'services/sso/jsaGovernedAuthLive.ts'), 'utf8');
check('Auth is initialized on the same Firebase app as Functions',
  liveAuth.includes('getApp()') && liveAuth.includes('initializeAuth')
  && liveAuth.includes('getReactNativePersistence')
  && liveAuth.includes('AsyncStorage'));
check('customToken is only passed to signInWithCustomToken, never SecureStore',
  liveAuth.includes('signInWithCustomToken')
  && !/SecureStore[\s\S]{0,200}customToken/.test(liveAuth)
  && !/JSON\.stringify\([^)]*customToken/.test(liveAuth));
const runtimeSrc = readFileSync(join(root, 'services/sso/jsaRuntime.ts'), 'utf8');
check('runtime persist path sanitizes and schema-validates before SecureStore',
  runtimeSrc.includes('sanitizeSessionForPersist')
  && runtimeSrc.includes('validatePersistedGovernedSession'));
const callablesSrc = readFileSync(join(root, 'services/sso/jsaRequestCallables.ts'), 'utf8');
check('protected get does not sign in — missing Auth stays unauthenticated',
  callablesSrc.includes('jsaGetReadRequest')
  && !callablesSrc.includes('signInWithCustomToken'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
