/**
 * Stop-condition for the 2026-08-14 02:55 governed Read-JSA failure.
 *
 * Field shape (Z Fold RFCY70ZP0TT, WB-JSA vc10, request vFdLkmqG…):
 *   - long-running explicit shift still authoritatively OPEN
 *   - governed session present (Firebase Auth hydrated)
 *   - AuthContext.session.passcodeHash absent
 *   - no local wellbuilt-current-shift-id
 *   - leftover date-scoped ack save on calendar today
 *   - WB-T reminted+registered intent=read (write:create)
 *   - ONE jsaGetReadRequest → pending/read (no refusal)
 *   - client then painted SHIFT_UNVERIFIED_COPY
 *
 * This test crosses the actual failing boundary: decideAfterGet of the
 * successful protected get, decideShiftAuthority of the home refresh,
 * decideJobDetailsIsolation of that pair, and leftover auto-nav.
 * A source-string pin alone is not the stop condition.
 *
 * Run: node --experimental-strip-types tools/test-jsaGovernedReadShiftGate.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideAfterGet,
  failClosedCopy,
} from '../services/sso/jsaRequestLifecycle.ts';
import {
  decideShiftAuthority,
  SHIFT_UNVERIFIED_COPY,
} from '../services/shiftAuthority.ts';
import {
  authorizedGovernedRequestReady,
  decideJobDetailsIsolation,
} from '../services/sso/jsaJobDetailsIsolation.ts';
import { decideAutoNavigation } from '../services/jsaAutoNav.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};

const REQUEST_ID = 'vFdLkmqG'.padEnd(43, 'A');
const JOB_REF = '4Oo9v0BLYddq0ylO5Ou6';
const OPEN_PERIOD = '2026-08-12_182535';

// 1. Protected get returned pending/read — same as 07:54:39Z Cloud Function log.
const getView = {
  requestId: REQUEST_ID,
  state: 'pending',
  intent: 'read',
  jobRef: JOB_REF,
  groupRef: null,
  wellName: 'Gab 1',
};
const afterGet = decideAfterGet(getView);
check('successful get of pending read resumes the read UI (does not fail-close)',
  afterGet.next === 'resume_ui'
  && afterGet.ui === 'full_read_and_signoff'
  && afterGet.terminalAction === 'read_and_acknowledged');
check('successful get is not mapped to authority_unverifiable copy',
  afterGet.next !== 'fail_closed'
  && failClosedCopy('authority_unverifiable') !== SHIFT_UNVERIFIED_COPY);

// 2. Home refresh at 02:54:39 — no passcodeHash, never fetched driver_shifts.
const homeDecision = decideShiftAuthority({
  isAuthenticated: false,
  authenticatedDriverId: null,
  authenticatedCompanyId: null,
  cachedShiftId: null,
  today: { fetchOk: true, httpStatus: null, currentShiftId: null, explicitlyEnded: false },
  originVerdict: 'not_consulted',
  isGovernedLaunch: true,
  governedReturnRequired: true,
  pendingRequest: null,
});
check('02:55 home refresh still refuses to label a current shift',
  homeDecision.mayLabelActive === false
  && homeDecision.surface === 'unverified_gate'
  && homeDecision.copy === SHIFT_UNVERIFIED_COPY
  && homeDecision.kind === 'authority_none');

// 3. Isolation after the matching get — THIS is the failing boundary.
const isolationInput = {
  resolved: true,
  authoritySurface: homeDecision.surface,
  explicitGovernedFailure: false,
  hasGovernedLaunch: true,
  hasUsableGovernedSession: true,
  hasMatchingAuthoritativeContext: true,
  authPending: false,
};
check('02:55 ready predicate: launch + usable session + matching get context',
  authorizedGovernedRequestReady(isolationInput) === true);
const isolation = decideJobDetailsIsolation(isolationInput);
check('matching get must mount the read stages, not Shift-not-verified',
  isolation.blocked === false
  && isolation.mountForm === true
  && isolation.mountNext === true
  && isolation.isolateOnly === false
  && isolation.surface !== 'unverified_gate'
  && isolation.reason === null);

// 4. Pre-get first paint (02:54:35) must still isolate — no matching context yet.
const preGet = decideJobDetailsIsolation({
  ...isolationInput,
  hasMatchingAuthoritativeContext: false,
});
check('before the get, unverified_gate still isolates (no stale content)',
  preGet.blocked === true
  && preGet.reason === 'unverified_gate'
  && preGet.isolateOnly === true);

// 5. Leftover date-scoped ack must not satisfy the new read request.
const leftoverNav = decideAutoNavigation({
  pendingRequestUsable: false,
  governedRequestPending: true,
  verdict: 'none',
  saveExists: true,
  saveShiftId: null,
  currentShiftId: null,
  isSsoMode: false,
});
check('leftover ack-1786677512199 cannot auto-open as the governed read',
  leftoverNav.action === 'suppress'
  && leftoverNav.reason === 'governed_request_requires_own_stages');

// 6. A real server refusal still fail-closes — do not mask it.
const refused = decideJobDetailsIsolation({
  resolved: true,
  authoritySurface: 'unverified_gate',
  explicitGovernedFailure: true,
  hasGovernedLaunch: true,
  hasUsableGovernedSession: true,
  hasMatchingAuthoritativeContext: true,
  authPending: false,
});
check('explicit governed failure still isolates (no copy-mask of a real refusal)',
  refused.blocked === true && refused.reason === 'governed_failed');

// 7. Wiring: Job Details card follows isolation, not raw authoritySurface.
const idx = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');
check('index paints the isolation card only when isolateOnly',
  idx.includes('workflowIsolation.isolateOnly')
  && !/authoritySurface === 'unverified_gate' \|\| workflowIsolation\.isolateOnly/.test(idx));
check('steps still consults decideJobDetailsIsolation (same boundary)',
  readFileSync(join(root, 'app/steps.tsx'), 'utf8').includes('decideJobDetailsIsolation'));

// 8. Overnight open period vs calendar today is not itself a get refusal.
check('open period is explicit and not calendar-today',
  /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(OPEN_PERIOD)
  && OPEN_PERIOD.slice(0, 10) !== '2026-08-14');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
