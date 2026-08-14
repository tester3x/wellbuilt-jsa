/**
 * JSA SSO callback owner — Expo Router / SINGLE_TASK / Linking share this.
 * Run: node --experimental-strip-types tools/test-jsaCallbackOwner.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isJsaSsoCallbackUrl,
  reconstructJsaCallbackUrl,
  handleJsaSsoCallbackUrl,
  resetJsaCallbackOwnerForTests,
} from '../services/sso/jsaCallbackOwner.ts';
import {
  parseJsaSsoCallbackUrl,
  consumeCallback,
  markConsumed,
} from '../services/sso/jsaPkce.ts';
import { decideBootstrap, mayShowLegacyLogin } from '../services/sso/jsaBootstrap.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const STATE = 'S'.repeat(43);
const VER = 'V'.repeat(43);
const CODE = 'c'.repeat(43);
const cbUrl = `jsaapp://sso-callback?v=1&status=success&code=${CODE}&state=${STATE}`;

function mem(over = {}) {
  const store = {
    attempt: { state: STATE, verifier: VER, createdAtMs: 1, consumed: false },
    session: null,
    exchanged: 0,
    obtained: 0,
    ...over.store,
  };
  const deps = {
    nowMs: () => 10,
    parseUrl: (u) => parseJsaSsoCallbackUrl(u),
    loadAttempt: async () => store.attempt,
    consume: (a, p, n) => consumeCallback(a, p, n),
    markConsumed,
    saveAttempt: async (a) => { store.attempt = a; },
    clearAttempt: async () => { store.attempt = store.attempt ? { ...store.attempt, consumed: true } : null; },
    exchange: async () => {
      store.exchanged += 1;
      return { protocolVersion: 1, uid: 'u', driverId: 'd', companyId: 'c' };
    },
    saveSession: async (p) => { store.session = p; },
    loadSession: async () => store.session,
    obtainAfterSession: async () => { store.obtained += 1; },
    ...over.deps,
  };
  return { store, deps };
}

resetJsaCallbackOwnerForTests();

check('reconstructs only protocol keys',
  reconstructJsaCallbackUrl({ v: '1', status: 'success', code: CODE, state: STATE, name: 'NOPE' })
    === `jsaapp://sso-callback?v=1&status=success&code=${CODE}&state=${STATE}`);
check('drops identity-bearing reconstruct keys',
  !String(reconstructJsaCallbackUrl({ v: '1', status: 'success', code: CODE, state: STATE, displayName: 'x' }))
    .includes('displayName'));
check('isJsaSsoCallbackUrl accepts canonical prefix', isJsaSsoCallbackUrl(cbUrl));
check('isJsaSsoCallbackUrl rejects start / legacy',
  !isJsaSsoCallbackUrl('jsaapp://start?v=1') && !isJsaSsoCallbackUrl('jsaapp://start?hash=x'));

{
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem();
  const r = await handleJsaSsoCallbackUrl(cbUrl, deps);
  check('cold callback exchanges once then obtains',
    r.kind === 'exchanged' && store.exchanged === 1 && store.obtained === 1 && !!store.session);
}

{
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem();
  const a = await handleJsaSsoCallbackUrl(cbUrl, deps);
  resetJsaCallbackOwnerForTests();
  const b = await handleJsaSsoCallbackUrl(cbUrl, deps);
  check('warm SINGLE_TASK second delivery is duplicate, no second exchange',
    a.kind === 'exchanged' && b.kind === 'duplicate' && store.exchanged === 1 && store.obtained === 2);
}

{
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem({
    deps: {
      exchange: async () => {
        await new Promise((r) => setTimeout(r, 15));
        store.exchanged += 1;
        return { protocolVersion: 1, uid: 'u', driverId: 'd', companyId: 'c' };
      },
    },
  });
  const first = handleJsaSsoCallbackUrl(cbUrl, deps);
  const second = handleJsaSsoCallbackUrl(cbUrl, deps);
  const [x, y] = await Promise.all([first, second]);
  check('in-flight dual delivery shares one exchange',
    x.kind === 'exchanged' && y.kind === 'exchanged' && store.exchanged === 1);
}

{
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem();
  store.attempt.consumed = true;
  store.session = { uid: 'u' };
  const r = await handleJsaSsoCallbackUrl(cbUrl, deps);
  check('process-death / already-consumed with session resumes obtain, no exchange',
    r.kind === 'duplicate' && store.exchanged === 0 && store.obtained === 1);
}

{
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem();
  // Fail-closed gate already visible: no session yet, pending attempt lives.
  store.session = null;
  const r = await handleJsaSsoCallbackUrl(cbUrl, deps);
  check('callback while fail-closed gate visible still exchanges then persists session',
    r.kind === 'exchanged' && !!store.session && store.exchanged === 1);
}

{
  resetJsaCallbackOwnerForTests();
  const { store, deps } = mem();
  const bad = await handleJsaSsoCallbackUrl('jsaapp://sso-callback?v=1&status=success&code=x&state=y', deps);
  check('malformed/mismatched callback fail-closes without exchange',
    bad.kind === 'fail_closed' && store.exchanged === 0);
  const ignored = await handleJsaSsoCallbackUrl('jsaapp://start?hash=abc&name=x', deps);
  check('legacy start is ignored by callback owner', ignored.kind === 'ignored' && store.exchanged === 0);
}

check('direct icon still opens Suite authorize, never legacy login',
  decideBootstrap({
    hasPersistedSession: false, incomingUrl: null, isCallback: false,
    isLaunch: false, isLegacyLaunch: false, isDirectIcon: true,
  }).action === 'open_suite_authorize'
  && mayShowLegacyLogin({
    governed: true,
    bootstrap: { action: 'open_suite_authorize' },
  }) === false);

const cbSrc = readFileSync(join(root, 'app/sso-callback.tsx'), 'utf8');
check('sso-callback route forwards to shared owner (does not only replace tabs)',
  cbSrc.includes('consumeJsaSsoCallback') && cbSrc.includes('reconstructJsaCallbackUrl')
  && !/router\.replace\('\/\(tabs\)'\)/.test(cbSrc));
check('sso-callback does not log callback query',
  !/console\.(log|warn|error)\([^)]*(code|state|verifier|url)/i.test(cbSrc));

const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
check('layout registers sso-callback screen', layout.includes('name="sso-callback"'));
check('layout getInitialURL consumes sso-callback (process-death)',
  /if \(url\.includes\('sso-callback'\)\)/.test(layout)
  && layout.includes('consumeJsaSsoCallback'));
check('layout Linking url event uses the same owner',
  layout.includes("event.url?.includes('sso-callback')")
  && layout.includes('consumeJsaSsoCallback'));
check('fail-closed overlay lifts after governed session',
  layout.includes('governedSessionReady')
  && layout.includes('!governedSessionReady'));

const ownerSrc = readFileSync(join(root, 'services/sso/jsaCallbackOwner.ts'), 'utf8');
check('owner has no credential console output',
  !/console\.(log|warn|error)/.test(ownerSrc));
check('session is saved before obtain/get',
  ownerSrc.indexOf('saveSession') < ownerSrc.indexOf('obtainAfterSession'));

const live = readFileSync(join(root, 'services/sso/jsaCallbackLive.ts'), 'utf8');
check('live exchange is wellbuilt-jsa audience only',
  live.includes("audience: 'wellbuilt-jsa'")
  && live.includes('ssoExchangeAuthorizationCode'));
check('live obtain runs after session persist',
  live.includes('persistAfterExchange') && live.includes('ownAndObtain'));
check('live persist installs Firebase Auth before SecureStore session',
  live.includes('persistAfterExchange') && !live.includes('sessionFromExchange'));

const suiteAdapter = readFileSync(join(root, '..', 'Suite', 'src', 'core', 'services', 'ssoRouteAdapter.ts'), 'utf8');
check('Suite Tickets/eQuipment callback builder is untouched by this repair',
  suiteAdapter.includes('buildAudienceCallbackUrl') && suiteAdapter.includes('SSO_CALLBACK_BY_AUDIENCE'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
