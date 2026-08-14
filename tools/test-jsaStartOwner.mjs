/**
 * Governed /start owner + Expo Router ownership harness.
 *
 * Reproduces the vc7 live failures (cold defer to unmounted start.tsx;
 * warm SINGLE_TASK; empty /sso-callback → unauthenticated) and proves
 * the shared owner closes them.
 *
 * Run: node --experimental-strip-types tools/test-jsaStartOwner.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isJsaStartUrl,
  normalizeJsaStartUrl,
  reconstructJsaStartUrl,
  handleJsaStartUrl,
  resetJsaStartOwnerForTests,
  attemptIsUsable,
  processHasOpenedStart,
  markProcessOpenedStart,
  decideStartAdoption,
  getStartOwnershipForTests,
  commitIfOwned,
} from '../services/sso/jsaStartOwner.ts';
import { parseJsaLaunchUrl, isLegacyJsaLaunchUrl, buildJsaLaunchUrl } from '../services/sso/jsaLaunch.ts';
import { reconstructJsaCallbackUrl, handleJsaSsoCallbackUrl, resetJsaCallbackOwnerForTests } from '../services/sso/jsaCallbackOwner.ts';
import { decideBootstrap, mayShowLegacyLogin } from '../services/sso/jsaBootstrap.ts';
import { SSO_ATTEMPT_TTL_MS } from '../services/sso/jsaPkce.ts';
import { JSA_START_ATTEMPT_TTL_MS } from '../services/sso/jsaStartOwner.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID = 'R'.repeat(43);
const RID2 = 'S'.repeat(43);
const startUrl = buildJsaLaunchUrl({
  v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt', jobRef: 'jobDoc1',
});
const legacyUrl = 'jsaapp://start?hash=abc&name=x&returnTo=wbt';

function mem(over = {}) {
  const store = {
    ownershipAction: 'own',
    session: null,
    attempt: null,
    minted: 0,
    suiteOpens: 0,
    obtains: 0,
    obtainKind: 'ready',
    logs: [],
    opened: new Set(),
    ...over.store,
  };
  const deps = {
    nowMs: () => 10_000,
    isLegacy: (u) => isLegacyJsaLaunchUrl(u),
    parseLaunch: (u) => {
      const p = parseJsaLaunchUrl(u);
      return p.ok ? { ok: true, value: p.value } : { ok: false };
    },
    ownLaunch: async () => store.ownershipAction,
    loadSession: async () => store.session,
    loadAttempt: async () => store.attempt,
    mintAttempt: async () => {
      store.minted += 1;
      store.attempt = { consumed: false, createdAtMs: 10_000 };
      return store.attempt;
    },
    openSuite: async () => { store.suiteOpens += 1; },
    obtain: async () => {
      store.obtains += 1;
      return { kind: store.obtainKind };
    },
    log: (e) => { store.logs.push(e); },
    hasOpenedFor: (id) => store.opened.has(id),
    markOpened: (id) => { store.opened.add(id); },
    ...over.deps,
  };
  return { store, deps };
}

// ── URL helpers ──────────────────────────────────────────────────────────
check('isJsaStartUrl accepts governed start', isJsaStartUrl(startUrl));
check('isJsaStartUrl rejects callback', !isJsaStartUrl('jsaapp://sso-callback?v=1&status=success'));
check('normalize Expo triple-slash start',
  normalizeJsaStartUrl(`jsaapp:///start?v=1&source=wbt&requestId=${RID}&returnTo=wbt`)
    .startsWith('jsaapp://start?'));
check('reconstruct drops identity keys',
  !String(reconstructJsaStartUrl({
    v: '1', source: 'wbt', requestId: RID, returnTo: 'wbt', name: 'NOPE', hash: 'abc',
  })).includes('name=') && !String(reconstructJsaStartUrl({
    v: '1', source: 'wbt', requestId: RID, returnTo: 'wbt', hash: 'abc',
  })).includes('hash='));
check('reconstruct empty params is null', reconstructJsaStartUrl({}) === null);
check('legacy launch detected', isLegacyJsaLaunchUrl(legacyUrl));

// ── Owner: no session → one Suite open ───────────────────────────────────
{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  const r = await handleJsaStartUrl(startUrl, deps, 'live');
  check('no session classifies need_auth and opens Suite once',
    r.kind === 'need_auth' && r.session === 'absent' && r.authorize === 'created'
    && r.suiteOpen === 'succeeded' && store.suiteOpens === 1 && store.minted === 1
    && store.logs.includes('received') && store.logs.includes('need_auth')
    && store.logs.includes('suite_open_succeeded'));
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  const a = await handleJsaStartUrl(startUrl, deps, 'live');
  resetJsaStartOwnerForTests();
  const b = await handleJsaStartUrl(startUrl, deps, 'live');
  check('duplicate delivery same process does not mint or open twice',
    a.kind === 'need_auth' && b.kind === 'duplicate'
    && store.suiteOpens === 1 && store.minted === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem({
    deps: {
      openSuite: async () => {
        await new Promise((r) => setTimeout(r, 15));
        store.suiteOpens += 1;
      },
    },
  });
  const first = handleJsaStartUrl(startUrl, deps, 'live');
  const second = handleJsaStartUrl(startUrl, deps, 'live');
  const [x, y] = await Promise.all([first, second]);
  check('in-flight dual delivery shares one Suite open',
    x.kind === 'need_auth' && y.kind === 'need_auth' && store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.session = { uid: 'u' };
  const r = await handleJsaStartUrl(startUrl, deps, 'live');
  check('valid session does get, no Suite authorize',
    r.kind === 'ready' && r.authorize === 'not_needed' && store.suiteOpens === 0
    && store.obtains === 1 && store.logs.includes('session_present')
    && store.logs.includes('get_begun'));
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.attempt = { consumed: false, createdAtMs: 10_000 - SSO_ATTEMPT_TTL_MS - 1 };
  const r = await handleJsaStartUrl(startUrl, deps, 'live');
  check('expired prior authorization mints a fresh attempt',
    r.kind === 'need_auth' && r.authorize === 'created' && store.minted === 1
    && store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.attempt = { consumed: true, createdAtMs: 9999 };
  const r = await handleJsaStartUrl(startUrl, deps, 'live');
  check('consumed/failed prior authorization mints a fresh attempt',
    r.kind === 'need_auth' && r.authorize === 'created' && store.minted === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.attempt = { consumed: false, createdAtMs: 9990 };
  const r = await handleJsaStartUrl(startUrl, deps, 'live');
  check('process-death recovery reuses unexpired attempt and opens Suite once',
    r.kind === 'need_auth' && r.authorize === 'reused' && store.minted === 0
    && store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  const r = await handleJsaStartUrl(legacyUrl, mem().deps, 'live');
  check('legacy hash/name launch fail-closes, no Suite',
    r.kind === 'fail_closed' && r.refusal === 'malformed' && r.ownership === 'refused');
}

{
  resetJsaStartOwnerForTests();
  const r = await handleJsaStartUrl('jsaapp://sso-callback?v=1', mem().deps, 'live');
  check('callback URL is ignored by start owner', r.kind === 'ignored');
}

{
  resetJsaStartOwnerForTests();
  const r = await handleJsaStartUrl(null, mem().deps, 'live');
  check('absent URL is ignored, not unauthenticated',
    r.kind === 'ignored' && r.refusal === undefined);
}

check('attemptIsUsable rejects consumed',
  attemptIsUsable({ consumed: true, createdAtMs: 1 }, 2) === false);
check('start-owner TTL matches PKCE TTL',
  JSA_START_ATTEMPT_TTL_MS === SSO_ATTEMPT_TTL_MS);

// ── OLD vs NEW routing harness ───────────────────────────────────────────
/**
 * 905d0c6 choreography: Router anchors (tabs). getInitialURL recognizes
 * /start and DEFER to start.tsx. If start.tsx never mounts, Suite never
 * opens. Empty /sso-callback reconstruct → unauthenticated.
 */
function oldWiringChoreography(input) {
  const router = { route: '(tabs)', startMounted: false, callbackMounted: false };
  const out = { suiteOpens: 0, owned: false, callbackRefusal: null, session: null, gets: 0 };
  if (input.anchorTabs) router.route = '(tabs)';
  if (input.mountStart) router.startMounted = true;
  if (input.mountCallbackEmpty) router.callbackMounted = true;

  if (input.delivery === 'getInitialURL' || input.delivery === 'both') {
    const parsed = parseJsaLaunchUrl(input.url);
    if (parsed.ok && !router.startMounted) {
      // 905d0c6 _layout: defer
    } else if (parsed.ok && router.startMounted) {
      out.owned = true;
      out.suiteOpens += 1;
    }
  }
  if (input.delivery === 'linking' && router.route !== '(tabs)' || false) {
    // warm linking only if listener runs; 905d0c6 did own here, but
    // live attempt 2 did not produce a Suite START.
  }
  if (input.warmSingleTask && !router.startMounted) {
    // start.tsx useEffect is mount-only
  }
  if (router.callbackMounted) {
    const reconstructed = reconstructJsaCallbackUrl(input.callbackParams || {});
    if (!reconstructed) out.callbackRefusal = 'unauthenticated';
  }
  return { router, out };
}

{
  const cold = oldWiringChoreography({
    url: startUrl, anchorTabs: true, mountStart: false, delivery: 'getInitialURL',
  });
  check('HARNESS old cold /start + (tabs) anchor + start never mounts → no Suite',
    cold.router.route === '(tabs)' && !cold.router.startMounted && cold.out.suiteOpens === 0);

  const warm = oldWiringChoreography({
    url: startUrl, anchorTabs: true, mountStart: false, warmSingleTask: true, delivery: 'getInitialURL',
  });
  check('HARNESS old warm SINGLE_TASK without remount → no Suite',
    warm.out.suiteOpens === 0);

  const emptyCb = oldWiringChoreography({
    url: startUrl, mountCallbackEmpty: true, callbackParams: {}, delivery: 'getInitialURL',
  });
  check('HARNESS old empty /sso-callback → unauthenticated (live card)',
    emptyCb.out.callbackRefusal === 'unauthenticated');
}

/**
 * New choreography: every delivery path calls the shared owner.
 * start.tsx mount is optional. Empty callback is not unauthenticated.
 */
async function newWiringChoreography(input) {
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  if (input.session) store.session = input.session;
  const router = { route: input.currentRoute || '(tabs)', startMounted: !!input.mountStart };
  const deliveries = [];
  if (input.getInitialURL) deliveries.push(input.url);
  if (input.linking) deliveries.push(input.url);
  if (input.routeParams) deliveries.push(reconstructJsaStartUrl(input.routeParams) || input.url);
  for (const url of deliveries) {
    await handleJsaStartUrl(url, deps, 'live');
  }
  let callbackRefusal = null;
  if (input.mountCallbackEmpty) {
    const reconstructed = reconstructJsaCallbackUrl(input.callbackParams || {});
    if (!reconstructed) {
      const startResult = await handleJsaStartUrl(input.url, deps, 'live');
      callbackRefusal = startResult.kind === 'ignored' ? 'malformed' : startResult.kind;
    }
  }
  return { router, store, callbackRefusal };
}

{
  const cold = await newWiringChoreography({
    url: startUrl, currentRoute: '(tabs)', mountStart: false, getInitialURL: true,
  });
  check('HARNESS new cold /start while Router anchors (tabs), start never mounts → one Suite',
    cold.router.route === '(tabs)' && !cold.router.startMounted && cold.store.suiteOpens === 1);

  const routeNever = await newWiringChoreography({
    url: startUrl, mountStart: false, getInitialURL: true, linking: true,
  });
  check('HARNESS new getInitialURL + Linking + no start.tsx → still one Suite',
    routeNever.store.suiteOpens === 1 && routeNever.store.minted === 1);

  const warm = await newWiringChoreography({
    url: startUrl, currentRoute: '/governed-status', mountStart: false,
    linking: true, getInitialURL: true,
  });
  check('HARNESS new warm /start while governed-status visible → one Suite',
    warm.store.suiteOpens === 1);

  const warmCb = await newWiringChoreography({
    url: startUrl, currentRoute: '/sso-callback', mountStart: false, linking: true,
  });
  check('HARNESS new warm /start while /sso-callback visible → one Suite',
    warmCb.store.suiteOpens === 1);

  const death = await newWiringChoreography({
    url: startUrl, getInitialURL: true,
  });
  check('HARNESS process-death recovery via getInitialURL opens Suite',
    death.store.suiteOpens === 1);

  const dup = await newWiringChoreography({
    url: startUrl, getInitialURL: true, linking: true,
    routeParams: { v: '1', source: 'wbt', requestId: RID, returnTo: 'wbt', jobRef: 'jobDoc1' },
  });
  check('HARNESS duplicate getInitialURL+Linking+route → one Suite',
    dup.store.suiteOpens === 1);

  const withSession = await newWiringChoreography({
    url: startUrl, getInitialURL: true, session: { uid: 'u' },
  });
  check('HARNESS valid session → get, no Suite',
    withSession.store.suiteOpens === 0 && withSession.store.obtains === 1);

  const emptyCb = await newWiringChoreography({
    url: startUrl, mountCallbackEmpty: true, callbackParams: {}, getInitialURL: true,
  });
  check('HARNESS empty /sso-callback is not unauthenticated; start owner runs',
    emptyCb.callbackRefusal !== 'unauthenticated'
    && emptyCb.callbackRefusal !== 'ignored'
    && emptyCb.store.suiteOpens === 1);

  const reuse = await newWiringChoreography({ url: startUrl, linking: true });
  check('HARNESS same WB-T request reuse (same RID) still valid need_auth',
    reuse.store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem();
  const started = await handleJsaStartUrl(startUrl, deps, 'live');
  store.session = { uid: 'u' };
  resetJsaStartOwnerForTests();
  const resumed = await handleJsaStartUrl(startUrl, deps, 'live');
  check('successful session persist then same start resumes via get, no second Suite',
    started.kind === 'need_auth' && started.suiteOpen === 'succeeded'
    && resumed.kind === 'ready' && store.suiteOpens === 1 && store.obtains === 1);
}

check('direct icon still Suite authorize, never legacy Login',
  decideBootstrap({
    hasPersistedSession: false, incomingUrl: null, isCallback: false,
    isLaunch: false, isLegacyLaunch: false, isDirectIcon: true,
  }).action === 'open_suite_authorize'
  && mayShowLegacyLogin({
    governed: true,
    bootstrap: { action: 'open_suite_authorize' },
  }) === false);

// ── Source wiring ────────────────────────────────────────────────────────
const startSrc = readFileSync(join(root, 'app/start.tsx'), 'utf8');
check('start.tsx forwards to shared owner',
  startSrc.includes('consumeJsaStart') && startSrc.includes('reconstructJsaStartUrl'));
check('start.tsx does not mint/open Suite itself',
  !startSrc.includes('mintAttempt') && !startSrc.includes('buildAuthorizeUrl'));

const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
check('layout getInitialURL no longer defers owned start to start.tsx',
  layout.includes('consumeJsaStart')
  && !layout.includes('start.tsx owns parse'));
check('layout Linking url uses the same start owner',
  layout.includes('isJsaStartUrl') && layout.includes('consumeJsaStart'));
check('layout bootstrap handle_launch uses the same start owner',
  layout.includes("decision.action === 'handle_launch'")
  && layout.includes('consumeJsaStart'));

const cbSrc = readFileSync(join(root, 'app/sso-callback.tsx'), 'utf8');
check('sso-callback empty reconstruct is not unauthenticated',
  cbSrc.includes('consumeStoredGovernedStart') || cbSrc.includes('consumeJsaStart'));
check('sso-callback ignored is not unauthenticated',
  !/kind === 'ignored'[\s\S]{0,200}unauthenticated/.test(cbSrc)
  && cbSrc.includes("refusal: 'malformed'"));
check('sso-callback catch is not unauthenticated',
  !/catch \{[\s\S]{0,200}unauthenticated/.test(cbSrc));

const ownerSrc = readFileSync(join(root, 'services/sso/jsaStartOwner.ts'), 'utf8');
check('start owner has no credential console output',
  !/console\.(log|warn|error)/.test(ownerSrc));

const live = readFileSync(join(root, 'services/sso/jsaStartLive.ts'), 'utf8');
check('live start logs are event-only JSON',
  live.includes("tag: '[jsa-start]'") && live.includes('event'));
check('live start logs do not interpolate secrets',
  !/console\.(log|warn|error)\([^)]*(url|code|state|verifier|legalName|requestId)/i.test(live));

const cbLive = readFileSync(join(root, 'services/sso/jsaCallbackLive.ts'), 'utf8');
check('callback live logs invoked + session_persisted',
  cbLive.includes("event: 'invoked'") && cbLive.includes("event: 'session_persisted'"));

check('process open-set helpers exist for recovery tests',
  typeof processHasOpenedStart === 'function' && typeof markProcessOpenedStart === 'function');

// ── Atomic, provenance-aware, generation-conditional ownership (vc10) ──────
// Field 8/13 23:49: the stale owned launch's run swallowed the fresh
// delivery. Codex blockers: adoption must be ATOMIC (serialized arbiter),
// provenance-aware (a warm getInitialURL replay never displaces a live
// delivery, without relying on completed/terminal markers or arrival
// order), and every side effect generation-conditional (null owner = not
// owned). These tests use gates/barriers to force real concurrency.

const RID_B = 'B'.repeat(43);
const RID_C = 'C'.repeat(43);
const urlA = startUrl; // RID
const urlB = buildJsaLaunchUrl({
  v: 1, source: 'wbt', requestId: RID_B, returnTo: 'wbt', jobRef: 'jobDoc1',
});
const urlC = buildJsaLaunchUrl({
  v: 1, source: 'wbt', requestId: RID_C, returnTo: 'wbt', jobRef: 'jobDoc1',
});
const gate = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };

// Pure adoption matrix — arrival order is not an input at all.
check('adoption: no owner, live adopts', decideStartAdoption({
  candidateRequestId: RID, candidateProvenance: 'live', candidateKnownStale: false,
  ownedRequestId: null, ownedAdoptedLive: false,
}) === 'adopt');
check('adoption: no owner, initial adopts (cold start)', decideStartAdoption({
  candidateRequestId: RID, candidateProvenance: 'initial', candidateKnownStale: false,
  ownedRequestId: null, ownedAdoptedLive: false,
}) === 'adopt');
check('adoption: same id joins whatever the provenance', decideStartAdoption({
  candidateRequestId: RID, candidateProvenance: 'initial', candidateKnownStale: false,
  ownedRequestId: RID, ownedAdoptedLive: true,
}) === 'join');
check('adoption: known-stale refused even when live', decideStartAdoption({
  candidateRequestId: RID, candidateProvenance: 'live', candidateKnownStale: true,
  ownedRequestId: RID_B, ownedAdoptedLive: false,
}) === 'stale_replay');
check('adoption: PENDING initial replay never displaces a live owner', decideStartAdoption({
  candidateRequestId: RID, candidateProvenance: 'initial', candidateKnownStale: false,
  ownedRequestId: RID_B, ownedAdoptedLive: true,
}) === 'stale_replay');
check('adoption: stored resume never displaces a live owner', decideStartAdoption({
  candidateRequestId: RID, candidateProvenance: 'stored', candidateKnownStale: false,
  ownedRequestId: RID_B, ownedAdoptedLive: true,
}) === 'stale_replay');
check('adoption: live displaces a non-live owner', decideStartAdoption({
  candidateRequestId: RID_B, candidateProvenance: 'live', candidateKnownStale: false,
  ownedRequestId: RID, ownedAdoptedLive: false,
}) === 'adopt');
check('adoption: initial may displace a disk-only owner (cold start)', decideStartAdoption({
  candidateRequestId: RID_B, candidateProvenance: 'initial', candidateKnownStale: false,
  ownedRequestId: RID, ownedAdoptedLive: false,
}) === 'adopt');

// Instrumented deps: the owner module holds ownership truth; these deps
// only feed hydration/staleness and record side effects.
function arbMem(over = {}) {
  const state = {
    persistedOwner: null,
    staleIds: new Set(),
    ownPersists: [],
    obtainCalls: [],
    obtainKind: 'ready',
    obtainGates: [],
    sessionGates: [],
    attemptGates: [],
    session: { uid: 'u' },
    suiteOpens: 0,
    ...over.state,
  };
  const { store, deps } = mem({
    deps: {
      ownLaunch: async (launch) => {
        state.ownPersists.push(launch.requestId);
        return 'own';
      },
      currentOwnedRequestId: async () => state.persistedOwner,
      isKnownStale: async (id) => state.staleIds.has(id),
      loadSession: async () => {
        state.sessionCalls = (state.sessionCalls || 0) + 1;
        const g = state.sessionGates.shift();
        if (g) await g;
        return state.session;
      },
      loadAttempt: async () => {
        state.attemptCalls = (state.attemptCalls || 0) + 1;
        const g = state.attemptGates.shift();
        if (g) await g;
        return state.attempt ?? null;
      },
      mintAttempt: async () => {
        state.attempt = { consumed: false, createdAtMs: 10_000 };
        return state.attempt;
      },
      openSuite: async () => { state.suiteOpens += 1; },
      obtain: async (stillOwned) => {
        state.obtainCalls.push({ ownedAtStart: stillOwned() });
        const g = state.obtainGates.shift();
        if (g) await g;
        return { kind: state.obtainKind, stillOwnedAtEnd: stillOwned() };
      },
      ...over.deps,
    },
  });
  return { state, store, deps };
}

// BARRIER: simultaneous B and C both submitted while owner is A. The
// serialized arbiter must produce distinct generations and exactly one
// final owner — never two winners of the same ownership generation.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: RID } });
  const pB = handleJsaStartUrl(urlB, m.deps, 'live');
  const pC = handleJsaStartUrl(urlC, m.deps, 'live'); // same tick — concurrent
  const [rB, rC] = await Promise.all([pB, pC]);
  const owner = getStartOwnershipForTests();
  check('concurrent B and C: exactly one final owner',
    owner.requestId === RID_C);
  check('concurrent B and C: loser superseded, winner ready',
    rC.kind === 'ready'
    && rB.kind === 'ignored' && rB.refusal === 'superseded');
  // B may legitimately have STARTED a read before losing — but exactly one
  // run wins, and the loser's settle carries no ready/steering result.
  check('concurrent B and C: no double-win of a generation',
    !(rB.kind === 'ready' && rC.kind === 'ready'));
}

// PENDING stale initial A (no completed context, no terminal marker)
// versus live B — order 1: initial A begins first, live B arrives second.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: RID, sessionGates: [g.p] } });
  const pA = handleJsaStartUrl(urlA, m.deps, 'initial'); // joins disk owner A, pauses
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live'); // live B adopts
  g.release();
  const rA = await pA;
  check('initial-A-first / live-B-second: B wins exactly once',
    rB.kind === 'ready' && getStartOwnershipForTests().requestId === RID_B
    && m.state.obtainCalls.length === 1);
  check('initial-A-first: A yields superseded with zero effects',
    rA.kind === 'ignored' && rA.refusal === 'superseded' && m.state.suiteOpens === 0);
}

// Order 2: live B begins first, stale initial A arrives second.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: null } });
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live');
  const rA = await handleJsaStartUrl(urlA, m.deps, 'initial'); // pending, no markers
  check('live-B-first / initial-A-second: A refused as stale replay',
    rB.kind === 'ready' && rA.kind === 'ignored' && rA.refusal === 'stale_replay'
    && getStartOwnershipForTests().requestId === RID_B);
}

// Ownership cleared to NULL while A is in flight: null means NOT owned.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: null, obtainGates: [g.p] } });
  const pA = handleJsaStartUrl(urlA, m.deps, 'live');
  while (m.state.obtainCalls.length === 0) await Promise.resolve(); // A's get in flight
  resetJsaStartOwnerForTests(); // ownership cleared to null mid-flight
  g.release();
  const rA = await pA;
  check('null ownership mid-flight: A superseded, no steering',
    rA.kind === 'ignored' && rA.refusal === 'superseded');
}

// A superseded immediately BEFORE Suite authorization: no Suite open.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: null, session: null, attemptGates: [g.p] } });
  const pA = handleJsaStartUrl(urlA, m.deps, 'live'); // need_auth, pauses at loadAttempt
  while ((m.state.attemptCalls || 0) === 0) await Promise.resolve(); // A holds the gate
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live'); // adopts
  g.release();
  const rA = await pA;
  check('superseded before authorize: A never opens Suite',
    rA.kind === 'ignored' && rA.refusal === 'superseded'
    && m.state.suiteOpens <= 1 && rB.kind === 'need_auth');
}

// A superseded immediately BEFORE the get: the get never starts.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: null, sessionGates: [g.p] } });
  const pA = handleJsaStartUrl(urlA, m.deps, 'live'); // pauses before get
  while ((m.state.sessionCalls || 0) === 0) await Promise.resolve(); // A holds the gate
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live');
  g.release();
  const rA = await pA;
  check('superseded before get: A performs zero gets',
    rA.kind === 'ignored' && rA.refusal === 'superseded'
    && m.state.obtainCalls.length === 1 && rB.kind === 'ready');
}

// Late A completion (get already started) cannot steer after B adopts —
// and the sync guard handed to the lifecycle reports the loss.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: null, obtainGates: [g.p] } });
  const pA = handleJsaStartUrl(urlA, m.deps, 'live'); // get in flight
  while (m.state.obtainCalls.length === 0) await Promise.resolve();
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live');
  g.release();
  const rA = await pA;
  const aCall = m.state.obtainCalls[0];
  check('late A: owned at get start, superseded at settle',
    aCall && aCall.ownedAtStart === true
    && rA.kind === 'ignored' && rA.refusal === 'superseded' && rB.kind === 'ready');
}

// ── R3: owned-effect transaction, promotion, persist-first (Codex re-audit) ──

// 1. B adopts BEFORE A's commit is queued → A's durable effect is skipped.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: null } });
  const rA = await handleJsaStartUrl(urlA, m.deps, 'live');
  const genA = getStartOwnershipForTests().generation;
  await handleJsaStartUrl(urlB, m.deps, 'live'); // B adopts
  let ran = 0;
  const out = await commitIfOwned(RID, genA, async () => { ran += 1; });
  check('commit after losing: effect skipped, not-applied',
    rA.kind === 'ready' && out.applied === false && ran === 0);
}

// 2. A's owned commit enters the arbiter first → B's adoption WAITS for
//    the awaited effect; afterwards A cannot write again.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: null } });
  await handleJsaStartUrl(urlA, m.deps, 'live');
  const genA = getStartOwnershipForTests().generation;
  const g = gate();
  const order = [];
  const pCommit = commitIfOwned(RID, genA, async () => { order.push('A-effect-start'); await g.p; order.push('A-effect-end'); });
  const pB = handleJsaStartUrl(urlB, m.deps, 'live').then((r) => { order.push('B-adopted'); return r; });
  await Promise.resolve(); await Promise.resolve();
  g.release();
  const [cA, rB] = await Promise.all([pCommit, pB]);
  const second = await commitIfOwned(RID, genA, async () => { order.push('A-late-write'); });
  check('adoption waits for the in-flight owned effect',
    cA.applied === true && rB.kind === 'ready'
    && order.indexOf('A-effect-end') < order.indexOf('B-adopted')
    && !order.includes('A-late-write') && second.applied === false);
}

// 3. A's save deliberately paused while B is submitted → the final context
//    cannot be overwritten by late A (adoption is queued BEHIND the
//    pending owned effect; once B adopts, A can never write again).
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: null } });
  await handleJsaStartUrl(urlA, m.deps, 'live');
  const genA = getStartOwnershipForTests().generation;
  const g = gate();
  const contexts = [];
  const pSave = commitIfOwned(RID, genA, async () => { await g.p; contexts.push('A'); });
  const pB = handleJsaStartUrl(urlB, m.deps, 'live');
  g.release();
  await Promise.all([pSave, pB]);
  const late = await commitIfOwned(RID, genA, async () => { contexts.push('A-late'); });
  check('paused save then B: no late overwrite',
    contexts.join(',') === 'A' && late.applied === false
    && getStartOwnershipForTests().requestId === RID_B);
}

// 6. Initial A starts, live A joins while in flight, then a different
//    initial replay arrives → A retains LIVE priority and is not displaced.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: null, obtainGates: [g.p] } });
  const pA1 = handleJsaStartUrl(urlA, m.deps, 'initial'); // A running, non-live
  while (m.state.obtainCalls.length === 0) await Promise.resolve();
  const pA2 = handleJsaStartUrl(urlA, m.deps, 'live');     // live join → promotion
  await Promise.resolve(); await Promise.resolve();
  const rB = await handleJsaStartUrl(urlB, m.deps, 'initial'); // initial replay
  g.release();
  const [rA1, rA2] = await Promise.all([pA1, pA2]);
  check('live join promotes: initial replay cannot displace A',
    rA1.kind === 'ready' && rA2.kind === 'ready'
    && rB.kind === 'ignored' && rB.refusal === 'stale_replay'
    && getStartOwnershipForTests().requestId === RID);
}

// 7. deps.ownLaunch throws → memory and durable ownership stay consistent
//    (nothing published), and a later adoption still succeeds.
{
  resetJsaStartOwnerForTests();
  let boom = true;
  const m = arbMem({
    state: { persistedOwner: null },
    deps: {
      ownLaunch: async () => {
        if (boom) { boom = false; throw new Error('persist failed'); }
        return 'own';
      },
    },
  });
  let threw = false;
  try { await handleJsaStartUrl(urlA, m.deps, 'live'); } catch { threw = true; }
  const afterFail = getStartOwnershipForTests();
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live');
  check('ownLaunch failure publishes nothing; later adoption works',
    threw && afterFail.requestId === null
    && rB.kind === 'ready' && getStartOwnershipForTests().requestId === RID_B);
}

// Same-request triple delivery still runs once.
{
  resetJsaStartOwnerForTests();
  const g = gate();
  const m = arbMem({ state: { persistedOwner: null, obtainGates: [g.p] } });
  const p1 = handleJsaStartUrl(urlA, m.deps, 'live');
  const p2 = handleJsaStartUrl(urlA, m.deps, 'initial');
  const p3 = handleJsaStartUrl(urlA, m.deps, 'live');
  g.release();
  const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
  check('same-request triple delivery is one run',
    m.state.obtainCalls.length === 1
    && r1.kind === 'ready' && r2.kind === 'ready' && r3.kind === 'ready');
}

// Duplicate deliveries after settling never duplicate Suite authorization.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: null, session: null } });
  const r1 = await handleJsaStartUrl(urlB, m.deps, 'live');
  const r2 = await handleJsaStartUrl(urlB, m.deps, 'live');
  check('duplicate deliveries: one Suite authorization',
    r1.kind === 'need_auth' && r2.kind === 'duplicate' && m.state.suiteOpens === 1);
}

// Cold start where getInitialURL is the ONLY delivery still succeeds.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: null } });
  const r = await handleJsaStartUrl(urlA, m.deps, 'initial');
  check('cold start with only a valid initial URL succeeds',
    r.kind === 'ready' && getStartOwnershipForTests().requestId === RID);
}

// ── R4: fail-open provenance defaults eliminated (Codex Finding 2) ─────────
// getInitialURL must never masquerade as a live delivery: the provenance
// parameter is REQUIRED at both the owner and live-consume boundaries, and
// a stale initial replay is refused however many times bootstrap re-runs.
{
  const ownerSrc2 = readFileSync(join(root, 'services/sso/jsaStartOwner.ts'), 'utf8');
  const liveSrc2 = readFileSync(join(root, 'services/sso/jsaStartLive.ts'), 'utf8');
  check('owner provenance parameter has NO default',
    /provenance: StartDeliveryProvenance,\n\)/.test(ownerSrc2.replace(/\r/g, ''))
    && !ownerSrc2.includes("provenance: StartDeliveryProvenance = 'live'"));
  check('live consume provenance parameter has NO default',
    !liveSrc2.includes("provenance: StartDeliveryProvenance = 'live'")
    && liveSrc2.includes('provenance: StartDeliveryProvenance,'));
}

// Repeated stale-initial replay after live B wins (bootstrap re-entry on
// isAuthenticated false→true): refused EVERY time, B keeps ownership, and
// B performed exactly one authorize/get run.
{
  resetJsaStartOwnerForTests();
  const m = arbMem({ state: { persistedOwner: RID } }); // disk owner = A
  const rB = await handleJsaStartUrl(urlB, m.deps, 'live');
  const replay1 = await handleJsaStartUrl(urlA, m.deps, 'initial');
  const replay2 = await handleJsaStartUrl(urlA, m.deps, 'initial'); // re-entry repeat
  check('repeated initial replays never displace the live owner',
    rB.kind === 'ready'
    && replay1.kind === 'ignored' && replay1.refusal === 'stale_replay'
    && replay2.kind === 'ignored' && replay2.refusal === 'stale_replay'
    && getStartOwnershipForTests().requestId === RID_B
    && m.state.obtainCalls.length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
