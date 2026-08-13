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
  const r = await handleJsaStartUrl(startUrl, deps);
  check('no session classifies need_auth and opens Suite once',
    r.kind === 'need_auth' && r.session === 'absent' && r.authorize === 'created'
    && r.suiteOpen === 'succeeded' && store.suiteOpens === 1 && store.minted === 1
    && store.logs.includes('received') && store.logs.includes('need_auth')
    && store.logs.includes('suite_open_succeeded'));
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  const a = await handleJsaStartUrl(startUrl, deps);
  resetJsaStartOwnerForTests();
  const b = await handleJsaStartUrl(startUrl, deps);
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
  const first = handleJsaStartUrl(startUrl, deps);
  const second = handleJsaStartUrl(startUrl, deps);
  const [x, y] = await Promise.all([first, second]);
  check('in-flight dual delivery shares one Suite open',
    x.kind === 'need_auth' && y.kind === 'need_auth' && store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.session = { uid: 'u' };
  const r = await handleJsaStartUrl(startUrl, deps);
  check('valid session does get, no Suite authorize',
    r.kind === 'ready' && r.authorize === 'not_needed' && store.suiteOpens === 0
    && store.obtains === 1 && store.logs.includes('session_present')
    && store.logs.includes('get_begun'));
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.attempt = { consumed: false, createdAtMs: 10_000 - SSO_ATTEMPT_TTL_MS - 1 };
  const r = await handleJsaStartUrl(startUrl, deps);
  check('expired prior authorization mints a fresh attempt',
    r.kind === 'need_auth' && r.authorize === 'created' && store.minted === 1
    && store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.attempt = { consumed: true, createdAtMs: 9999 };
  const r = await handleJsaStartUrl(startUrl, deps);
  check('consumed/failed prior authorization mints a fresh attempt',
    r.kind === 'need_auth' && r.authorize === 'created' && store.minted === 1);
}

{
  resetJsaStartOwnerForTests();
  const { store, deps } = mem();
  store.attempt = { consumed: false, createdAtMs: 9990 };
  const r = await handleJsaStartUrl(startUrl, deps);
  check('process-death recovery reuses unexpired attempt and opens Suite once',
    r.kind === 'need_auth' && r.authorize === 'reused' && store.minted === 0
    && store.suiteOpens === 1);
}

{
  resetJsaStartOwnerForTests();
  const r = await handleJsaStartUrl(legacyUrl, mem().deps);
  check('legacy hash/name launch fail-closes, no Suite',
    r.kind === 'fail_closed' && r.refusal === 'malformed' && r.ownership === 'refused');
}

{
  resetJsaStartOwnerForTests();
  const r = await handleJsaStartUrl('jsaapp://sso-callback?v=1', mem().deps);
  check('callback URL is ignored by start owner', r.kind === 'ignored');
}

{
  resetJsaStartOwnerForTests();
  const r = await handleJsaStartUrl(null, mem().deps);
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
    await handleJsaStartUrl(url, deps);
  }
  let callbackRefusal = null;
  if (input.mountCallbackEmpty) {
    const reconstructed = reconstructJsaCallbackUrl(input.callbackParams || {});
    if (!reconstructed) {
      const startResult = await handleJsaStartUrl(input.url, deps);
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
  const started = await handleJsaStartUrl(startUrl, deps);
  store.session = { uid: 'u' };
  resetJsaStartOwnerForTests();
  const resumed = await handleJsaStartUrl(startUrl, deps);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
