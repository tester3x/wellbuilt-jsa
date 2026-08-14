/**
 * Cross-boundary stop-condition: governed Job Details fields.
 * Fixture uses the live 02:55 / 03:40 request-invoice shape.
 *
 * Run: node --experimental-strip-types tools/test-jsaGovernedJobFields.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseGetContextView,
  decideAfterGet,
  ignoreLaunchHints,
  pendingDisplayFields,
} from '../services/sso/jsaRequestLifecycle.ts';
import { decideGovernedJobPopulate } from '../services/sso/jsaGovernedJobFields.ts';
import { decideJobDetailsIsolation } from '../services/sso/jsaJobDetailsIsolation.ts';
import { decideAutoNavigation } from '../services/jsaAutoNav.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID = 'vFdLkmqG'.padEnd(43, 'A');
const JOB = '4Oo9v0BLYddq0ylO5Ou6';

const getPayload = {
  requestId: RID,
  state: 'pending',
  intent: 'read',
  jobRef: JOB,
  groupRef: null,
  expiresAtMs: 9_999_999_999,
  wellName: 'Gab 1',
  jobType: 'pw',
};

const parsed = parseGetContextView(getPayload);
check('fixture get payload parses', parsed.ok === true);
const view = parsed.ok ? parsed.value : null;

check('decideAfterGet resumes read UI with Gab 1',
  view && decideAfterGet(view).next === 'resume_ui'
  && decideAfterGet(view).ui === 'full_read_and_signoff');

const pop = decideGovernedJobPopulate({
  launchRequestId: RID,
  context: view,
  explicitFailure: false,
});
check('exact field case: Gab 1 populates before user input',
  pop.kind === 'populate' && pop.wellName === 'Gab 1' && pop.jobType === 'pw');

const isolation = decideJobDetailsIsolation({
  resolved: true,
  authoritySurface: 'unverified_gate',
  explicitGovernedFailure: false,
  hasGovernedLaunch: true,
  hasUsableGovernedSession: true,
  hasMatchingAuthoritativeContext: true,
  authPending: false,
});
check('exact field case: Job Details mounts so Next can proceed',
  isolation.mountForm === true && isolation.mountNext === true && isolation.isolateOnly === false);

const hinted = ignoreLaunchHints(
  { requestId: RID, wellName: 'Other Well', jobType: 'oil', jobRef: 'hint-job' },
  view,
);
check('server Gab 1 wins over URL hint Other',
  hinted.used.wellName === 'Gab 1'
  && hinted.discarded.wellName === 'Other Well'
  && hinted.discarded.ignored === true);

check('request/context mismatch does not populate',
  decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { ...view, requestId: 'S'.repeat(43) },
    explicitFailure: false,
  }).kind === 'none');

check('completed/terminal context does not populate',
  decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'completed', intent: 'read', wellName: 'Gab 1' },
    explicitFailure: false,
  }).kind === 'none');

check('explicit terminal fail-closes and does not populate',
  decideGovernedJobPopulate({
    launchRequestId: RID,
    context: view,
    explicitFailure: true,
  }).kind === 'fail_closed');

const missing = parseGetContextView({
  requestId: RID, state: 'pending', intent: 'read', jobRef: JOB, groupRef: null,
});
check('pending read without wellName fail-closes after get',
  missing.ok && decideAfterGet(missing.value).next === 'fail_closed'
  && decideGovernedJobPopulate({
    launchRequestId: RID,
    context: missing.value,
    explicitFailure: false,
  }).kind === 'fail_closed');

check('leftover ack-1786677512199 stays suppressed',
  decideAutoNavigation({
    pendingRequestUsable: false,
    governedRequestPending: true,
    verdict: 'none',
    saveExists: true,
    saveShiftId: null,
    currentShiftId: null,
    isSsoMode: false,
  }).reason === 'governed_request_requires_own_stages');

check('pending display never copies driver/company/shift identity',
  !('driverId' in pendingDisplayFields(view))
  && !('companyId' in pendingDisplayFields(view))
  && !('shiftId' in pendingDisplayFields(view)));

const idx = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');
check('index populates wells from decideGovernedJobPopulate only',
  idx.includes('decideGovernedJobPopulate')
  && idx.includes("job.kind === 'populate'"));
check('index skips jsa_autofill wells when a governed launch is present',
  /loadLaunchContext[\s\S]{0,180}jsa_autofill/.test(idx)
  && idx.includes('if (await loadLaunchContext())'));
check('index does not read passcodeHash or wellbuilt-current-shift-id for job identity',
  !/decideGovernedJobPopulate[\s\S]{0,400}passcodeHash/.test(idx)
  && !/decideGovernedJobPopulate[\s\S]{0,400}wellbuilt-current-shift-id/.test(idx));

check('get payload rejects identity-bearing extras',
  parseGetContextView({ ...getPayload, driverId: 'x' }).ok === false);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
