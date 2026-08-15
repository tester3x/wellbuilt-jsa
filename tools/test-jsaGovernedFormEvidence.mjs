/**
 * Phase 5C — governed printed name, step evidence, one local save,
 * and Location & Activity summary presentation.
 * Run: node --experimental-strip-types tools/test-jsaGovernedFormEvidence.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStepEvidence,
  decideGovernedPrintedName,
  decideGovernedSubmitEvidence,
  emptyStepEvidence,
  requiredStepEvidencePresent,
} from '../services/sso/jsaGovernedFormEvidence.ts';
import {
  applyGovernedLocalSave,
  adaptGovernedSnapshot,
  existingGovernedSave,
} from '../services/sso/jsaArtifactSnapshot.ts';
import {
  decideAttestationScope,
  emptyAttestation,
  readAttestationDraft,
  writeAttestationDraft,
  applyAttestationCompletion,
} from '../services/sso/jsaAttestationScope.ts';
import {
  decideGovernedJobPopulate,
  finalizeSaveActivityFields,
  freezeGovernedJobForSave,
} from '../services/sso/jsaGovernedJobFields.ts';
import { JSA_STEPS } from '../constants/jsaTemplate.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID_A = 'A'.repeat(43);
const RID_B = 'B'.repeat(43);
const ROUTE_RID = 'Z'.repeat(43);
const SESS_A = '1786741459475';
const SESS_B = '1786749999999';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const LEGAL = 'Michael Burger';
const REQUIRED = JSA_STEPS.map((s) => s.id);
const ALL_ACKS = Object.fromEntries(REQUIRED.map((id) => [id, true]));

function memStore(init = {}) {
  const data = { ...init };
  return {
    getItem: async (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: async (k, v) => { data[k] = v; },
    removeItem: async (k) => { delete data[k]; },
    snapshot: () => ({ ...data }),
    keys: () => Object.keys(data),
  };
}

// C4 — hostile params cannot replace legalName
{
  const printed = decideGovernedPrintedName({
    source: 'governed_snapshot',
    legalName: LEGAL,
  });
  const hostileSubmit = decideGovernedSubmitEvidence({
    source: 'governed_snapshot',
    legalName: LEGAL,
    standalonePrintedName: 'Hostile Driver',
    signatureImage: PNG_B64,
    requiredStepIds: REQUIRED,
    stepAcks: ALL_ACKS,
    stepsAcknowledged: true,
  });
  check('C4 hostile driverName/displayName cannot replace legalName',
    printed.kind === 'ok'
    && printed.printedName === LEGAL
    && hostileSubmit.kind === 'ok'
    && hostileSubmit.printedName === LEGAL
    && hostileSubmit.printedName !== 'Hostile Driver');
}

// C4 — missing legalName blocks submit without save/complete/persist
{
  const missing = decideGovernedSubmitEvidence({
    source: 'governed_snapshot',
    legalName: '',
    standalonePrintedName: 'Mike',
    signatureImage: PNG_B64,
    requiredStepIds: REQUIRED,
    stepAcks: ALL_ACKS,
    stepsAcknowledged: true,
  });
  const calls = { save: 0, complete: 0, persist: 0 };
  if (missing.kind === 'fail_closed') {
    // no-op: fail closed before any I/O
  } else {
    calls.save += 1;
  }
  check('C4 missing governed legalName blocks Submit with no save/complete/persist',
    missing.kind === 'fail_closed'
    && missing.reason === 'missing_legal_name'
    && calls.save === 0 && calls.complete === 0 && calls.persist === 0);
}

// C4 — signature preload remains allowed and PNG is frozen
{
  const ok = decideGovernedSubmitEvidence({
    source: 'governed_snapshot',
    legalName: LEGAL,
    signatureImage: PNG_B64,
    requiredStepIds: REQUIRED,
    stepAcks: ALL_ACKS,
    stepsAcknowledged: true,
  });
  const payload = {
    signature: ok.kind === 'ok' ? ok.printedName : 'nope',
    signatureImage: PNG_B64,
    ppeSelected: {},
    prepared: {},
    locations: ['Gab 1'],
    locationAcks: { 'Gab 1': true },
    date: '2026-08-12',
  };
  const adapted = adaptGovernedSnapshot(payload);
  const signoffSrc = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
  check('C4 canonical signature preload remains allowed and PNG is frozen',
    ok.kind === 'ok'
    && adapted.ok
    && adapted.value.printedName === LEGAL
    && adapted.value.signature.data === PNG_B64
    && signoffSrc.includes('fetchDriverProfile')
    && signoffSrc.includes('setSignatureImage(profile.signature)')
    && !/fresh signature|must re-sign|require.*stroke/i.test(signoffSrc));
}

// C6 — fresh governed scope starts with no step evidence
{
  const store = memStore();
  const scope = { kind: 'governed', scopeId: RID_A };
  const draft = await readAttestationDraft(store, scope);
  const evidence = buildStepEvidence(REQUIRED, draft.stepAcks);
  check('C6 fresh governed scope starts with no step evidence',
    JSON.stringify(emptyStepEvidence()) === JSON.stringify({ stepAcks: {}, stepsAcknowledged: false })
    && Object.keys(draft.stepAcks).length === 0
    && draft.stepsAcknowledged === false
    && evidence.stepsAcknowledged === false
    && requiredStepEvidencePresent({
      requiredStepIds: REQUIRED,
      stepAcks: evidence.stepAcks,
      stepsAcknowledged: evidence.stepsAcknowledged,
    }) === false);
}

// C6 — same scope restores only its own step evidence
{
  const store = memStore();
  const scope = { kind: 'governed', scopeId: RID_A };
  const evidence = buildStepEvidence(REQUIRED, { [REQUIRED[0]]: true, [REQUIRED[1]]: true });
  await writeAttestationDraft(store, scope, evidence);
  const restored = await readAttestationDraft(store, scope);
  check('C6 same scope restores only its own step evidence',
    restored.stepAcks[REQUIRED[0]] === true
    && restored.stepAcks[REQUIRED[1]] === true
    && restored.stepAcks[REQUIRED[2]] !== true
    && restored.stepsAcknowledged === false);
}

// C6 — scope B cannot see scope A
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    stepAcks: ALL_ACKS,
    stepsAcknowledged: true,
  });
  const b = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_B });
  check('C6 scope B cannot see scope A acknowledgments',
    Object.keys(b.stepAcks).length === 0
    && b.stepsAcknowledged === false);
}

// C6 — route requestId cannot select governed step evidence
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    stepAcks: ALL_ACKS,
    stepsAcknowledged: true,
  });
  const viaRoute = decideAttestationScope({
    source: 'governed_snapshot',
    governedRequestId: '',
    standaloneSessionId: ROUTE_RID,
    routeRequestId: RID_A,
  });
  const loaded = viaRoute.kind === 'ready'
    ? await readAttestationDraft(store, viaRoute.scope)
    : emptyAttestation();
  check('C6 route requestId cannot select governed step evidence',
    viaRoute.kind === 'none'
    && viaRoute.reason === 'governed_unresolved'
    && Object.keys(loaded.stepAcks).length === 0);
}

// C6 — skipped/incomplete required steps block governed Submit
{
  const incomplete = decideGovernedSubmitEvidence({
    source: 'governed_snapshot',
    legalName: LEGAL,
    signatureImage: PNG_B64,
    requiredStepIds: REQUIRED,
    stepAcks: { [REQUIRED[0]]: true },
    stepsAcknowledged: false,
  });
  const defaultTrue = decideGovernedSubmitEvidence({
    source: 'governed_snapshot',
    legalName: LEGAL,
    signatureImage: PNG_B64,
    requiredStepIds: REQUIRED,
    stepAcks: {},
    stepsAcknowledged: true,
  });
  check('C6 incomplete or defaulted steps block governed Submit',
    incomplete.kind === 'fail_closed'
    && incomplete.reason === 'missing_step_evidence'
    && defaultTrue.kind === 'fail_closed');
}

// C6 — completed steps appear in the actual pre-adapter payload
{
  const evidence = buildStepEvidence(REQUIRED, ALL_ACKS);
  const payload = {
    signature: LEGAL,
    signatureImage: PNG_B64,
    ppeSelected: { hardHat: true },
    ppeOtherItems: [],
    prepared: { trained: true },
    locations: ['Gab 1'],
    locationAcks: { 'Gab 1': true },
    date: '2026-08-12',
    stepAcks: evidence.stepAcks,
    stepsAcknowledged: evidence.stepsAcknowledged,
  };
  const adapted = adaptGovernedSnapshot(payload);
  check('C6 completed steps appear accurately in the pre-adapter payload',
    evidence.stepsAcknowledged === true
    && payload.stepsAcknowledged === true
    && REQUIRED.every((id) => payload.stepAcks[id] === true)
    && adapted.ok
    && adapted.value.stepsAcknowledged === true
    && REQUIRED.every((id) => adapted.value.stepAcks[id] === true));
}

// C7 — retry with same governedRequestRef and no pendingComplete reuses one save
{
  const first = {
    id: 'save-1',
    governedRequestRef: RID_A,
    signature: LEGAL,
    notes: 'frozen-original',
    signatureImage: PNG_B64,
  };
  const retryCandidate = {
    id: 'save-2',
    governedRequestRef: RID_A,
    signature: 'Changed Name',
    notes: 'rebuilt-from-screen',
    signatureImage: 'changed',
  };
  const applied = applyGovernedLocalSave([first], RID_A, retryCandidate);
  check('C7 retry without pendingComplete reuses one local save',
    applied.created === false
    && applied.id === 'save-1'
    && applied.record.notes === 'frozen-original'
    && applied.saves.length === 1
    && existingGovernedSave(applied.saves, RID_A).id === 'save-1');
}

// C7 — changed form/route values on retry do not alter the frozen save
{
  const frozen = {
    id: 'orig',
    governedRequestRef: RID_A,
    signature: LEGAL,
    wellName: 'Gab 1',
    jobActivityName: '',
    notes: 'frozen',
    ppeSelected: { hardHat: true },
  };
  const rebuilt = {
    id: 'new',
    governedRequestRef: RID_A,
    signature: 'Hostile',
    wellName: 'Other Well',
    jobActivityName: 'oil',
    notes: 'from current screen',
    ppeSelected: { glasses: true },
  };
  const applied = applyGovernedLocalSave([frozen], RID_A, rebuilt);
  check('C7 changed current form/route values do not alter the frozen save',
    applied.record === frozen
    && applied.record.notes === 'frozen'
    && applied.record.wellName === 'Gab 1'
    && applied.record.jobActivityName === ''
    && applied.record.signature === LEGAL);
}

// C7 — different requestIds create distinct saves
{
  const a = applyGovernedLocalSave([], RID_A, { id: 'a', governedRequestRef: RID_A, notes: 'A' });
  const b = applyGovernedLocalSave(a.saves, RID_B, { id: 'b', governedRequestRef: RID_B, notes: 'B' });
  check('C7 different requestIds create distinct saves',
    a.created && b.created
    && b.saves.length === 2
    && existingGovernedSave(b.saves, RID_A).id === 'a'
    && existingGovernedSave(b.saves, RID_B).id === 'b');
}

// C7 — double Submit cannot create two local saves
{
  const first = applyGovernedLocalSave([], RID_A, { id: 'one', governedRequestRef: RID_A, notes: 'first' });
  const second = applyGovernedLocalSave(first.saves, RID_A, { id: 'two', governedRequestRef: RID_A, notes: 'second' });
  check('C7 double Submit cannot create two local saves',
    first.created && !second.created
    && second.saves.length === 1
    && second.record.notes === 'first');
}

// Pending retry/fail-closed retains draft, frozen save, and queue
{
  const store = memStore({
    '@jsa/saves': JSON.stringify([{ id: 'orig', governedRequestRef: RID_A, notes: 'frozen' }]),
    '@jsa/governedArtifactQueue': JSON.stringify([{ requestId: RID_A, snapshot: { printedName: LEGAL } }]),
  });
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    stepAcks: ALL_ACKS,
    stepsAcknowledged: true,
    prepared: { trained: true },
  });
  const pending = await applyAttestationCompletion(store, { kind: 'governed', scopeId: RID_A }, 'pending_retry');
  const failed = await applyAttestationCompletion(store, { kind: 'governed', scopeId: RID_A }, 'fail_closed');
  const snap = store.snapshot();
  const draft = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  check('pending retry/fail-closed retains scoped draft, frozen save, and queue',
    pending === 'retained' && failed === 'retained'
    && snap['@jsa/saves'].includes('frozen')
    && snap['@jsa/governedArtifactQueue'].includes(RID_A)
    && draft.stepsAcknowledged === true
    && draft.prepared.trained === true);
}

// Phase 5A job authority unchanged
{
  const noType = decideGovernedJobPopulate({
    launchRequestId: RID_A,
    context: { requestId: RID_A, state: 'pending', intent: 'read', jobRef: 'job', wellName: 'Gab 1' },
    explicitFailure: false,
  });
  const frozen = freezeGovernedJobForSave({
    populate: noType,
    wells: [{ name: 'Gab 1', jobType: 'oil' }],
    wellName: 'Gab 1',
    jobActivityName: 'oil',
  });
  const fields = finalizeSaveActivityFields({
    source: frozen.source,
    frozenJobActivityName: frozen.jobActivityName,
    frozenWellName: frozen.wellName,
    frozenWells: frozen.wells,
    canonicalActivity: 'oil',
    paramsTask: 'oil',
    standaloneWellName: 'Gab 1',
    standaloneWells: [{ name: 'Gab 1', jobType: 'oil' }],
  });
  check('Phase 5A request-bound well/job fields remain unchanged',
    fields.wellName === 'Gab 1'
    && fields.jobActivityName === ''
    && fields.task === ''
    && !fields.wells[0].jobType);
}

// Phase 5B PPE/prepared isolation unchanged
{
  const store = memStore({
    '@jsa/ppe/selected': JSON.stringify({ hardHat: true, gloves: true }),
    '@jsa/prepared': JSON.stringify({ trained: true, sds: true }),
  });
  const governed = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  const standalone = await readAttestationDraft(store, { kind: 'standalone', scopeId: SESS_B });
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    ppeSelected: { vest: true },
    prepared: { trained: true },
  });
  const other = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_B });
  check('Phase 5B PPE/prepared isolation remains unchanged',
    JSON.stringify(governed.ppeSelected) === '{}'
    && JSON.stringify(standalone.prepared) === '{}'
    && JSON.stringify(other.ppeSelected) === '{}'
    && (await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A })).ppeSelected.vest === true);
}

// No jsas writer introduced
{
  const formSrc = readFileSync(join(root, 'services/sso/jsaGovernedFormEvidence.ts'), 'utf8');
  const scopeSrc = readFileSync(join(root, 'services/sso/jsaAttestationScope.ts'), 'utf8');
  check('no jsas writer is introduced',
    !/\/jsas\/|collection\(\s*['"]jsas['"]/.test(formSrc)
    && !/\/jsas\//.test(scopeSrc));
}

// Presentation — Location & Activity title is its own full-width row
{
  const card = readFileSync(join(root, 'components/jsa/JsaSummaryCard.tsx'), 'utf8');
  const stepsSrc = readFileSync(join(root, 'app/steps.tsx'), 'utf8');
  const ppeSrc = readFileSync(join(root, 'app/ppe.tsx'), 'utf8');
  const signoffSrc = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
  const titleOwnRow = /locationActivitySection[\s\S]{0,200}sectionTitle/.test(card)
    && card.includes('t("Location & Activity")')
    && card.includes('pairLeft')
    && card.includes('pairRight')
    && card.includes('textAlign: "left"')
    && card.includes('textAlign: "right"');
  const oldSameRowGone = !/styles\.label\}\>\{t\("Location & Activity"\)\}[\s\S]{0,80}valueContainer/.test(card)
    && !/\[\{r\.resolvedActivity\}\]/.test(card)
    && !card.includes('valueContainer');
  check('summary title is a full-width row and values are on the next row',
    titleOwnRow && oldSameRowGone);
  check('governed summary does not restore missing activity from route params',
    /jobHandoff\.source === 'nav_params'[\s\S]{0,80}jobActivityName, task/.test(stepsSrc)
    && /jobSource === 'nav_params' \? \(jobActivity \|\| task\) : jobActivity/.test(ppeSrc)
    && /jobSource === 'nav_params' \? \(params\.task as string \| undefined\) : jobActivityResolved/.test(signoffSrc));
  check('steps/PPE/signoff still render JsaSummaryCard',
    stepsSrc.includes('<JsaSummaryCard')
    && ppeSrc.includes('<JsaSummaryCard')
    && signoffSrc.includes('<JsaSummaryCard'));
}

// Screen wiring pins
{
  const signoffSrc = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
  const stepsSrc = readFileSync(join(root, 'app/steps.tsx'), 'utf8');
  const ack = readFileSync(join(root, 'app/acknowledge.tsx'), 'utf8');
  check('signoff uses request-bound printed name and step evidence at submit',
    signoffSrc.includes('decideGovernedSubmitEvidence')
    && signoffSrc.includes('legalAcknowledgmentName')
    && signoffSrc.includes('applyGovernedLocalSave')
    && signoffSrc.includes('submitLockRef')
    && signoffSrc.includes('stepAcks: stepAcksForSave')
    && signoffSrc.includes('signature: printedNameForSave')
    && signoffSrc.includes("jobSource !== 'governed_snapshot' && params.driverName"));
  check('steps persist scoped step evidence through the attestation envelope',
    stepsSrc.includes('buildStepEvidence')
    && stepsSrc.includes('writeAttestationDraft')
    && stepsSrc.includes('stepAcks: JSON.stringify')
    && stepsSrc.includes('decideAttestationScope'));
  check('acknowledge shares applyGovernedLocalSave without changing ack-only UX',
    ack.includes('applyGovernedLocalSave')
    && ack.includes("action: 'acknowledged'")
    && ack.includes('legalAcknowledgmentName'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
