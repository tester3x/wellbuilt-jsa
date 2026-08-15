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
import {
  applyGovernedJobHandoff,
  decideGovernedJobPopulate,
  freezeGovernedJobForSave,
  shouldApplyLegacyJobHydration,
  snapshotFromPopulate,
} from '../services/sso/jsaGovernedJobFields.ts';
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

check('request/context mismatch fails closed',
  decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { ...view, requestId: 'S'.repeat(43) },
    explicitFailure: false,
  }).kind === 'fail_closed'
  && decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { ...view, requestId: 'S'.repeat(43) },
    explicitFailure: false,
  }).reason === 'mismatch');

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
  idx.includes('shouldApplyLegacyJobHydration')
  && idx.includes('jsa_autofill')
  && idx.includes('loadLaunchContext'));
check('index does not read passcodeHash or wellbuilt-current-shift-id for job identity',
  !/decideGovernedJobPopulate[\s\S]{0,400}passcodeHash/.test(idx)
  && !/decideGovernedJobPopulate[\s\S]{0,400}wellbuilt-current-shift-id/.test(idx));

check('get payload rejects identity-bearing extras',
  parseGetContextView({ ...getPayload, driverId: 'x' }).ok === false);

{
  const snap = snapshotFromPopulate(pop);
  check('5A snapshot is get well/job only',
    !!snap
    && snap.wellName === 'Gab 1'
    && snap.jobType === 'pw'
    && !('driverId' in snap)
    && !('companyId' in snap)
    && !('shiftId' in snap)
    && JSON.parse(snap.wellsJson)[0].name === 'Gab 1');
  check('5A empty SSO CTA params still hand off Gab 1',
    applyGovernedJobHandoff({
      populate: pop,
      wellsParam: '[]',
      wellNameParam: '',
      jobActivityParam: '',
    }).source === 'governed_snapshot'
    && applyGovernedJobHandoff({
      populate: pop,
      wellsParam: '[]',
      wellNameParam: '',
      jobActivityParam: '',
    }).wellName === 'Gab 1'
    && applyGovernedJobHandoff({
      populate: pop,
      wellsParam: '[]',
      wellNameParam: '',
      jobActivityParam: '',
    }).jobActivityName === 'pw');
  check('5A URL/Other Well params lose to the get snapshot',
    applyGovernedJobHandoff({
      populate: pop,
      wellsParam: JSON.stringify([{ name: 'Other Well', jobType: 'oil' }]),
      wellNameParam: 'Other Well',
      jobActivityParam: 'oil',
    }).wellName === 'Gab 1'
    && applyGovernedJobHandoff({
      populate: pop,
      wellsParam: JSON.stringify([{ name: 'Other Well', jobType: 'oil' }]),
      wellNameParam: 'Other Well',
      jobActivityParam: 'oil',
    }).jobActivityName === 'pw');
  check('5A standalone/no-populate keeps nav params',
    applyGovernedJobHandoff({
      populate: { kind: 'none', reason: 'no_launch' },
      wellsParam: JSON.stringify([{ name: 'Local Well' }]),
      wellNameParam: 'Local Well',
      jobActivityParam: 'water',
    }).source === 'nav_params'
    && applyGovernedJobHandoff({
      populate: { kind: 'none', reason: 'no_launch' },
      wellsParam: JSON.stringify([{ name: 'Local Well' }]),
      wellNameParam: 'Local Well',
      jobActivityParam: 'water',
    }).wellName === 'Local Well');
  check('5A completed/ack populate does not invent a snapshot',
    snapshotFromPopulate({
      kind: 'none',
      reason: 'completed',
    }) === null
    && snapshotFromPopulate({
      kind: 'none',
      reason: 'acknowledge_only',
    }) === null);
  const frozen = freezeGovernedJobForSave({
    populate: pop,
    wells: [{ name: 'Other Well', jobType: 'oil' }],
    wellName: 'Other Well',
    jobActivityName: 'oil',
  });
  check('5A frozen save snapshot matches displayed get well/job',
    frozen.source === 'governed_snapshot'
    && frozen.wellName === 'Gab 1'
    && frozen.jobActivityName === 'pw'
    && frozen.wells[0].name === 'Gab 1'
    && frozen.wells[0].jobType === 'pw');
  check('5A fail-closed never falls back to resume/autofill/day-status params',
    applyGovernedJobHandoff({
      populate: { kind: 'fail_closed', reason: 'mismatch' },
      wellsParam: JSON.stringify([{ name: 'Resume Well' }]),
      wellNameParam: 'Resume Well',
      jobActivityParam: 'oil',
    }).source === 'blocked'
    && applyGovernedJobHandoff({
      populate: { kind: 'fail_closed', reason: 'mismatch' },
      wellsParam: JSON.stringify([{ name: 'Resume Well' }]),
      wellNameParam: 'Resume Well',
      jobActivityParam: 'oil',
    }).wellName === ''
    && decideGovernedJobPopulate({
      launchRequestId: RID,
      context: null,
      explicitFailure: false,
    }).kind === 'fail_closed');
  check('5A missing well fails closed and does not hydrate',
    decideGovernedJobPopulate({
      launchRequestId: RID,
      context: { requestId: RID, state: 'pending', intent: 'read', jobRef: JOB },
      explicitFailure: false,
    }).reason === 'missing_well'
    && shouldApplyLegacyJobHydration(true) === false
    && shouldApplyLegacyJobHydration(false) === true);
}

const stepsSrc = readFileSync(join(root, 'app/steps.tsx'), 'utf8');
const ppeSrc = readFileSync(join(root, 'app/ppe.tsx'), 'utf8');
const signoffSrc = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
const liveSrc = readFileSync(join(root, 'services/sso/jsaGovernedJobLive.ts'), 'utf8');
check('5A steps applies the same handoff before forwarding PPE params',
  stepsSrc.includes('applyGovernedJobHandoff')
  && stepsSrc.includes('decideGovernedJobPopulate')
  && stepsSrc.indexOf('applyGovernedJobHandoff') < stepsSrc.indexOf('pathname: "/ppe"'));
check('5A index Next and SSO CTA both apply the handoff',
  idx.includes('applyGovernedJobHandoff')
  && (idx.split('applyGovernedJobHandoff').length - 1) >= 2
  && idx.includes("pathname: '/steps'"));
check('5A resume/autofill/day-status cannot override governed wells',
  idx.includes("AsyncStorage.getItem('jsa_resume')")
  && idx.includes("AsyncStorage.getItem('jsa_autofill')")
  && (idx.split('shouldApplyLegacyJobHydration').length - 1) >= 3);
check('5A PPE and signoff re-resolve from request context',
  ppeSrc.includes('resolveGovernedJobHandoff')
  && signoffSrc.includes('resolveGovernedJobHandoff')
  && signoffSrc.includes('freezeGovernedJobForSave'));
check('5A failure path does not remint, complete, persist, or write jsas',
  !/jsaRegisterReadRequest|jsaCompleteReadRequest|jsaPersistGovernedArtifact/.test(liveSrc)
  && !/['"]jsas['"]|\/jsas\//.test(liveSrc)
  && stepsSrc.includes("pathname: '/governed-status'")
  && ppeSrc.includes("pathname: '/governed-status'"));
check('5A standalone legacy hydration remains available without a launch',
  shouldApplyLegacyJobHydration(false) === true
  && applyGovernedJobHandoff({
    populate: { kind: 'none', reason: 'no_launch' },
    wellsParam: JSON.stringify([{ name: 'Stamp Well' }]),
    wellNameParam: 'Stamp Well',
    jobActivityParam: 'water',
  }).source === 'nav_params');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
