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
  decideGovernedJobScreen,
  freezeGovernedJobForSave,
  finalizeSaveActivityFields,
  jobWorkflowMayAdvance,
  pendingGovernedReadMaySave,
  shouldApplyLegacyJobHydration,
  snapshotFromPopulate,
} from '../services/sso/jsaGovernedJobFields.ts';
import { adaptGovernedSnapshot } from '../services/sso/jsaArtifactSnapshot.ts';
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

{
  const completedPop = decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'completed', intent: 'read', wellName: 'Gab 1', jobType: 'pw' },
    explicitFailure: false,
  });
  const completedHand = applyGovernedJobHandoff({
    populate: completedPop,
    wellsParam: JSON.stringify([{ name: 'Other Well' }]),
    wellNameParam: 'Other Well',
    jobActivityParam: 'oil',
  });
  check('5A-1 only none/no_launch returns nav_params',
    applyGovernedJobHandoff({
      populate: { kind: 'none', reason: 'no_launch' },
      wellsParam: '[]', wellNameParam: 'X', jobActivityParam: 'oil',
    }).source === 'nav_params'
    && completedHand.source !== 'nav_params'
    && applyGovernedJobHandoff({
      populate: { kind: 'none', reason: 'acknowledge_only' },
      wellsParam: '[]', wellNameParam: 'X', jobActivityParam: 'oil',
    }).source !== 'nav_params');
  check('5A-1 completed never returns navigation fields',
    completedPop.kind === 'none' && completedPop.reason === 'completed'
    && completedHand.source === 'completed'
    && completedHand.wellName === ''
    && completedHand.jobActivityName === ''
    && completedHand.wells === '[]'
    && decideGovernedJobScreen(completedPop) === 'completed');
  const ackPop = decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'pending', intent: 'acknowledge', wellName: 'Gab 1' },
    explicitFailure: false,
  });
  check('5A-1 acknowledge_only never enters steps/PPE/signoff',
    ackPop.reason === 'acknowledge_only'
    && decideGovernedJobScreen(ackPop) === 'acknowledge'
    && applyGovernedJobHandoff({
      populate: ackPop, wellsParam: '[]', wellNameParam: 'X', jobActivityParam: 'oil',
    }).source === 'acknowledge_only');
  const stale = decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'expired', intent: 'read', wellName: 'Gab 1' },
    explicitFailure: false,
  });
  const staleHand = applyGovernedJobHandoff({
    populate: stale, wellsParam: JSON.stringify([{ name: 'Legacy' }]), wellNameParam: 'Legacy', jobActivityParam: 'oil',
  });
  const staleFreeze = freezeGovernedJobForSave({
    populate: stale, wells: [{ name: 'Legacy' }], wellName: 'Legacy', jobActivityName: 'oil',
  });
  check('5A-1 not_pending cannot create a local save or reach legacy cloud persistence',
    stale.kind === 'fail_closed' && stale.reason === 'not_pending'
    && decideGovernedJobScreen(stale) === 'fail'
    && staleHand.source === 'blocked'
    && staleFreeze.wells.length === 0
    && pendingGovernedReadMaySave(staleHand) === false);
  const unknown = decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'pending', intent: 'something_else', wellName: 'Gab 1' },
    explicitFailure: false,
  });
  check('5A-1 unknown governed states fail closed',
    unknown.kind === 'fail_closed'
    && decideGovernedJobScreen(unknown) === 'fail'
    && applyGovernedJobHandoff({
      populate: unknown, wellsParam: '[]', wellNameParam: 'X', jobActivityParam: 'oil',
    }).source === 'blocked');
  const noType = decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'pending', intent: 'read', jobRef: JOB, wellName: 'Gab 1' },
    explicitFailure: false,
  });
  const noTypeHand = applyGovernedJobHandoff({
    populate: noType,
    wellsParam: JSON.stringify([{ name: 'Gab 1', jobType: 'oil' }]),
    wellNameParam: 'Gab 1',
    jobActivityParam: 'oil',
  });
  const noTypeFreeze = freezeGovernedJobForSave({
    populate: noType,
    wells: [{ name: 'Gab 1', jobType: 'oil' }],
    wellName: 'Gab 1',
    jobActivityName: 'oil',
  });
  check('5A-1 missing jobType defeats a hostile route jobActivity',
    noType.kind === 'populate' && !noType.jobType
    && noTypeHand.jobActivityName === ''
    && noTypeHand.wellName === 'Gab 1'
    && !/oil/.test(noTypeHand.wells));
  check('5A-1 missing governed jobType stays absent on frozen well and form fields',
    noTypeFreeze.jobActivityName === ''
    && noTypeFreeze.wells[0].name === 'Gab 1'
    && !noTypeFreeze.wells[0].jobType);
  check('5A-1 PPE/signoff cannot advance while governed resolution is pending',
    jobWorkflowMayAdvance({ resolution: 'pending', handoff: noTypeHand }) === false
    && jobWorkflowMayAdvance({ resolution: 'failed', handoff: noTypeHand }) === false
    && jobWorkflowMayAdvance({ resolution: 'ready', handoff: noTypeHand }) === true
    && jobWorkflowMayAdvance({ resolution: 'ready', handoff: completedHand }) === false);
}

const ppeAdvance = ppeSrc.includes("jobGate !== 'ready'")
  && /const handleNext = \(\) => \{[\s\S]{0,80}jobGate !== 'ready'/.test(ppeSrc);
const signoffHold = signoffSrc.includes("jobGate !== 'ready' || !jobSource")
  && /const handleSubmit = \(\) => \{[\s\S]{0,80}jobGate !== 'ready'/.test(signoffSrc)
  && /const saveAndGo = async \(\) => \{[\s\S]{0,80}jobGate !== 'ready'/.test(signoffSrc);
check('5A-1 PPE cannot advance while governed resolution is pending', ppeAdvance);
check('5A-1 signoff cannot submit while governed resolution is pending', signoffHold);
check('5A-1 failed/terminal resolution produces no save or legacy cloud write',
  stepsSrc.includes("'/acknowledge'")
  && stepsSrc.includes("mode: 'completed'")
  && signoffSrc.includes("pendingGovernedReadMaySave")
  && signoffSrc.includes("frozenJob.source !== 'governed_snapshot'")
  && !/jsaRegisterReadRequest|runCloudPersist/.test(liveSrc));

{
  const noTypePop = decideGovernedJobPopulate({
    launchRequestId: RID,
    context: { requestId: RID, state: 'pending', intent: 'read', jobRef: JOB, wellName: 'Gab 1' },
    explicitFailure: false,
  });
  const hostileWells = [{ name: 'Gab 1', jobType: 'oil' }];
  const frozenHostile = freezeGovernedJobForSave({
    populate: noTypePop,
    wells: hostileWells,
    wellName: 'Gab 1',
    jobActivityName: 'oil',
  });
  const canonicalHostile = 'oil';
  const paramsTaskHostile = 'oil';
  const governedFields = finalizeSaveActivityFields({
    source: frozenHostile.source,
    frozenJobActivityName: frozenHostile.jobActivityName,
    frozenWellName: frozenHostile.wellName,
    frozenWells: frozenHostile.wells,
    canonicalActivity: canonicalHostile,
    paramsTask: paramsTaskHostile,
    standaloneWellName: 'Gab 1',
    standaloneWells: hostileWells,
  });
  const governedPayload = {
    jobActivityName: governedFields.jobActivityName,
    wellName: governedFields.wellName,
    wells: governedFields.wells,
    task: governedFields.task,
    locations: ['Gab 1'],
    locationAcks: { 'Gab 1': true },
    signature: 'Mike Burger',
    signatureImage: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    prepared: { trained: true },
    notes: '',
    pusher: '',
    otherInfo: '',
    date: '2026-08-12',
  };
  const activityBlob = JSON.stringify({
    jobActivityName: governedPayload.jobActivityName,
    task: governedPayload.task,
    jobType: governedPayload.jobType,
    wells: governedPayload.wells,
  });
  const adapted = adaptGovernedSnapshot(governedPayload);
  check('5A-2 freeze still leaves missing jobType empty against hostile oil',
    noTypePop.kind === 'populate' && !noTypePop.jobType
    && frozenHostile.source === 'governed_snapshot'
    && frozenHostile.wellName === 'Gab 1'
    && frozenHostile.jobActivityName === ''
    && !frozenHostile.wells[0].jobType);
  check('5A-2 governed pre-adapter payload keeps Gab 1 and empty activity',
    governedPayload.wellName === 'Gab 1'
    && governedPayload.jobActivityName === ''
    && governedPayload.task === ''
    && Array.isArray(governedPayload.wells)
    && governedPayload.wells[0].name === 'Gab 1'
    && !governedPayload.wells[0].jobType
    && !('jobType' in governedPayload));
  check('5A-2 governed pre-adapter activity fields contain no oil',
    !/oil/.test(activityBlob)
    && !/oil/.test(governedPayload.jobActivityName)
    && !/oil/.test(governedPayload.task)
    && !governedPayload.wells.some((w) => /oil/.test(JSON.stringify(w.jobType || ''))));
  check('5A-2 adapter input payload is the finalized request-bound fields',
    adapted.ok === true
    && !/oil/.test(JSON.stringify({
      jobActivityName: governedPayload.jobActivityName,
      task: governedPayload.task,
      wells: governedPayload.wells,
    })));

  const standalonePop = { kind: 'none', reason: 'no_launch' };
  const standaloneFrozen = freezeGovernedJobForSave({
    populate: standalonePop,
    wells: hostileWells,
    wellName: 'Gab 1',
    jobActivityName: 'oil',
  });
  const standaloneFields = finalizeSaveActivityFields({
    source: standaloneFrozen.source,
    frozenJobActivityName: standaloneFrozen.jobActivityName,
    frozenWellName: standaloneFrozen.wellName,
    frozenWells: standaloneFrozen.wells,
    canonicalActivity: canonicalHostile,
    paramsTask: paramsTaskHostile,
    standaloneWellName: 'Gab 1',
    standaloneWells: hostileWells,
  });
  const standalonePayload = {
    jobActivityName: standaloneFields.jobActivityName,
    wellName: standaloneFields.wellName,
    wells: standaloneFields.wells,
    task: standaloneFields.task,
  };
  check('5A-2 standalone fixture retains legacy oil activity',
    standaloneFrozen.source === 'nav_params'
    && standalonePayload.wellName === 'Gab 1'
    && standalonePayload.jobActivityName === 'oil'
    && standalonePayload.task === 'oil'
    && standalonePayload.wells[0].jobType === 'oil');
}

check('5A-2 signoff finalizes activity at the adapter payload boundary',
  signoffSrc.includes('finalizeSaveActivityFields')
  && signoffSrc.includes('task: taskForSave')
  && signoffSrc.includes('jobActivityName: activityForSave')
  && !/task:\s*activityForSave\s*\|\|\s*paramsTask\s*\|\|\s*canonicalActivity/.test(signoffSrc));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
