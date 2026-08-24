import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSuiteCardSingleFlight,
  decideSuiteCardEntry,
} from '../services/sso/jsaSuiteCardContract.ts';
import { decideRecovery } from '../services/sso/jsaRequestLifecycle.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(join(ROOT, path), 'utf8');
let passed = 0; let failed = 0;
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? passed++ : failed++; };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

check('off-shift standalone state starts governed Suite authorization', decideSuiteCardEntry('standalone') === 'authorize');
check('exact governed identity reuses its installed session', decideSuiteCardEntry('usable') === 'use_session');
for (const mismatch of ['uid_mismatch', 'authority_mismatch', 'installation_not_finalized', 'baseline_missing_or_mismatched']) {
  check(`${mismatch} fails closed`, decideSuiteCardEntry(mismatch) === 'fail_closed');
}

{
  const gate = createSuiteCardSingleFlight(); const held = deferred(); let starts = 0;
  const cold = gate.run(async () => { starts++; await held.promise; return 'opened'; });
  const warm = gate.run(async () => { starts++; return 'duplicate'; });
  held.resolve();
  check('cold and already-running Suite card deliveries share one authorization',
    cold === warm && await cold === 'opened' && starts === 1);
}

const layout = source('app/_layout.tsx');
const login = source('app/login.tsx');
const home = source('app/(tabs)/index.tsx');
const live = source('services/sso/jsaSuiteCardLive.ts');
const runtime = source('services/sso/jsaRuntime.ts');
check('legacy Suite card identity fields are ignored and never sent to authentication',
  !/ssoLogin\(/.test(layout) && !/ssoLogin\(/.test(login)
  && /hash\/name\/truck\/trailer\/shiftId are never consumed/.test(login));
check('Suite card uses wellbuilt-jsa PKCE authorize URL',
  /buildAuthorizeUrl\(attempt\)/.test(live) && /mintAttempt/.test(live));
check('active shift without WB-T request is authenticated but cannot manufacture a JSA request',
  /No Active JSA Request/.test(home)
  && /Open the current job in WellBuilt Tickets to begin its JSA/.test(home)
  && /mayLabelActive \? "No Active JSA Request" : "Active Shift Required"/.test(home));
check('truly off-shift governed session retains History and Settings but hides new-JSA form',
  /Active Shift Required/.test(home) && /hasGovernedIdentity \|\| isSsoMode/.test(home)
  && /Saved JSAs, History, and Settings remain available/.test(home));
check('active exact period retains governed JSA action',
  /isSsoMode && mayLabelActive/.test(home) && /Read Safety Steps/.test(home));
check('no local or governed history deletion was introduced',
  !/removeItem\([^)]*(saves|activeJsas|artifact)/i.test(live + login));
check('Suite card clears stale request ownership without clearing identity or saved work',
  /clearGovernedRequestStateForSuiteCard/.test(live)
  && /clearLaunchContext\(\)/.test(runtime)
  && !/clearGovernedRequestStateForSuiteCard[\s\S]{0,700}(clearGovernedSession|clearAuthRecoveryLatch|STORAGE_KEYS\.saves)/.test(runtime));
check('Suite card preserves pending completion and verified completion-return state',
  !/clearGovernedRequestStateForSuiteCard[\s\S]{0,500}(clearPendingComplete|clearFreshSubmittedMarker)/.test(runtime));
{
  const pending = { requestId: 'request-a', action: 'read_and_acknowledged' };
  const matching = decideRecovery({
    phase: 'local_saved_pending_complete',
    launch: { requestId: 'request-a' },
    context: { requestId: 'request-a', state: 'pending' },
    pendingComplete: pending,
  });
  const different = decideRecovery({
    phase: 'local_saved_pending_complete',
    launch: { requestId: 'request-b' },
    context: { requestId: 'request-b', state: 'pending' },
    pendingComplete: pending,
  });
  check('later exact WB-T request retries its retained pending completion',
    matching.next === 'retry_complete' && matching.requestId === 'request-a');
  check('different WB-T request cannot consume retained pending completion',
    different.next === 'fail_closed');
}

console.log(`\nRESULT passed=${passed} failed=${failed} total=${passed + failed}`);
process.exit(failed ? 1 : 0);
