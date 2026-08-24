import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createSuiteCardSingleFlight,
  decideSuiteCardEntry,
} from '../services/sso/jsaSuiteCardContract.ts';

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
check('legacy Suite card identity fields are ignored and never sent to authentication',
  !/ssoLogin\(/.test(layout) && !/ssoLogin\(/.test(login)
  && /hash\/name\/truck\/trailer\/shiftId are never consumed/.test(login));
check('Suite card uses wellbuilt-jsa PKCE authorize URL',
  /buildAuthorizeUrl\(attempt\)/.test(live) && /mintAttempt/.test(live));
check('off-shift governed session retains History and Settings but hides new-JSA form',
  /Active Shift Required/.test(home) && /hasGovernedIdentity \|\| isSsoMode/.test(home)
  && /Saved JSAs, History, and Settings remain available/.test(home));
check('active exact period retains governed JSA action',
  /isSsoMode && mayLabelActive/.test(home) && /Read Safety Steps/.test(home));
check('no local or governed history deletion was introduced',
  !/removeItem\([^)]*(saves|activeJsas|artifact)/i.test(live + login));

console.log(`\nRESULT passed=${passed} failed=${failed} total=${passed + failed}`);
process.exit(failed ? 1 : 0);
