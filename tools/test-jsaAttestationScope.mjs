/**
 * Per-JSA PPE / prepared attestation isolation.
 * Run: node --experimental-strip-types tools/test-jsaAttestationScope.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATTESTATION_DRAFT_KEY,
  LEGACY_ATTESTATION_KEYS,
  applyAttestationCompletion,
  buildAttestationEnvelope,
  decideAttestationScope,
  emptyAttestation,
  forgetLegacyAttestationKeys,
  isLegacyAttestationKey,
  loadAttestationForScope,
  parseAttestationEnvelope,
  readAttestationDraft,
  writeAttestationDraft,
} from '../services/sso/jsaAttestationScope.ts';
import {
  decideGovernedJobPopulate,
  finalizeSaveActivityFields,
  freezeGovernedJobForSave,
} from '../services/sso/jsaGovernedJobFields.ts';
import { adaptGovernedSnapshot } from '../services/sso/jsaArtifactSnapshot.ts';
import { STORAGE_KEYS } from '../constants/storageKeys.ts';

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
const JOB = '4Oo9v0BLYddq0ylO5Ou6';
const SESS_A = '1786741459475';
const SESS_B = '1786749999999';
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const ALL_TRUE_PPE = { hardHat: true, gloves: true, glasses: true };
const ALL_TRUE_PREPARED = { trained: true, toolsAndPpe: true, sds: true };
const JSA_A_PPE = { hardHat: true, gloves: false };
const JSA_A_OTHER = ['face shield'];
const JSA_A_PREPARED = { trained: true, toolsAndPpe: false, sds: true };

function memStore(init = {}) {
  const data = { ...init };
  let gets = [];
  return {
    getItem: async (k) => {
      gets.push(k);
      return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
    },
    setItem: async (k, v) => { data[k] = v; },
    removeItem: async (k) => { delete data[k]; },
    snapshot: () => ({ ...data }),
    keys: () => Object.keys(data),
    gets: () => gets.slice(),
  };
}

function globalAllTrueStore() {
  return memStore({
    [STORAGE_KEYS.ppeSelected]: JSON.stringify(ALL_TRUE_PPE),
    [STORAGE_KEYS.ppeOther]: JSON.stringify(['global visor']),
    [STORAGE_KEYS.prepared]: JSON.stringify(ALL_TRUE_PREPARED),
  });
}

const governedReady = decideAttestationScope({
  source: 'governed_snapshot',
  governedRequestId: RID_A,
  standaloneSessionId: SESS_A,
});
const standaloneReady = decideAttestationScope({
  source: 'nav_params',
  governedRequestId: RID_A,
  standaloneSessionId: SESS_A,
});

// 1. Existing device-global all-true PPE/prepared values do not preload into a governed JSA.
{
  const store = globalAllTrueStore();
  const state = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  const gotLegacy = store.gets().some((k) => isLegacyAttestationKey(k));
  check('1 global all-true PPE/prepared do not preload a governed JSA',
    governedReady.kind === 'ready'
    && governedReady.scope.kind === 'governed'
    && governedReady.scope.scopeId === RID_A
    && JSON.stringify(state) === JSON.stringify(emptyAttestation())
    && gotLegacy === false);
}

// 2. Existing global values do not preload into a new standalone session.
{
  const store = globalAllTrueStore();
  const state = await readAttestationDraft(store, { kind: 'standalone', scopeId: SESS_B });
  check('2 global values do not preload a new standalone session',
    standaloneReady.kind === 'ready'
    && JSON.stringify(state) === JSON.stringify(emptyAttestation())
    && !store.gets().some((k) => isLegacyAttestationKey(k)));
}

// 3. Same governed request restores its PPE and prepared state.
{
  const store = memStore();
  const scope = { kind: 'governed', scopeId: RID_A };
  await writeAttestationDraft(store, scope, {
    ppeSelected: JSA_A_PPE,
    ppeOther: JSA_A_OTHER,
    prepared: JSA_A_PREPARED,
  });
  const restored = await readAttestationDraft(store, scope);
  check('3 same governed request restores PPE and prepared',
    restored.ppeSelected.hardHat === true
    && restored.ppeSelected.gloves === false
    && restored.ppeOther[0] === 'face shield'
    && restored.prepared.trained === true
    && restored.prepared.toolsAndPpe === false
    && restored.prepared.sds === true);
}

// 4. Governed request B cannot see request A's state.
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    ppeSelected: JSA_A_PPE,
    ppeOther: JSA_A_OTHER,
    prepared: JSA_A_PREPARED,
  });
  const b = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_B });
  check('4 governed request B cannot see request A',
    JSON.stringify(b) === JSON.stringify(emptyAttestation()));
}

// 5. Same standalone session restores its state.
{
  const store = memStore();
  const scope = { kind: 'standalone', scopeId: SESS_A };
  await writeAttestationDraft(store, scope, {
    ppeSelected: { boots: true },
    ppeOther: ['earmuffs'],
    prepared: { trained: true },
  });
  const restored = await readAttestationDraft(store, scope);
  check('5 same standalone session restores its state',
    restored.ppeSelected.boots === true
    && restored.ppeOther[0] === 'earmuffs'
    && restored.prepared.trained === true);
}

// 6. Standalone session B cannot see session A's state.
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'standalone', scopeId: SESS_A }, {
    ppeSelected: { boots: true },
    ppeOther: ['earmuffs'],
    prepared: { trained: true },
  });
  const b = await readAttestationDraft(store, { kind: 'standalone', scopeId: SESS_B });
  check('6 standalone session B cannot see session A',
    JSON.stringify(b) === JSON.stringify(emptyAttestation()));
}

// 7. A route-supplied requestId cannot select a governed attestation scope.
{
  const missingHandoff = decideAttestationScope({
    source: 'governed_snapshot',
    governedRequestId: '',
    standaloneSessionId: ROUTE_RID,
    routeRequestId: ROUTE_RID,
  });
  const launchHint = decideAttestationScope({
    source: 'governed_snapshot',
    governedRequestId: undefined,
    standaloneSessionId: ROUTE_RID,
  });
  const onlyHandoff = decideAttestationScope({
    source: 'governed_snapshot',
    governedRequestId: RID_A,
    standaloneSessionId: ROUTE_RID,
    routeRequestId: ROUTE_RID,
  });
  check('7 route-supplied requestId cannot select a governed scope',
    missingHandoff.kind === 'none'
    && missingHandoff.reason === 'governed_unresolved'
    && launchHint.kind === 'none'
    && onlyHandoff.kind === 'ready'
    && onlyHandoff.scope.scopeId === RID_A
    && onlyHandoff.scope.scopeId !== ROUTE_RID);
}

// 8. Missing or malformed stored scope loads empty.
{
  const missing = loadAttestationForScope(null, { kind: 'governed', scopeId: RID_A });
  const malformed = loadAttestationForScope('{not-json', { kind: 'governed', scopeId: RID_A });
  const wrongShape = loadAttestationForScope(JSON.stringify({
    v: 1, kind: 'governed', scopeId: RID_A, ppeSelected: { hardHat: 'yes' }, ppeOther: [], prepared: {},
  }), { kind: 'governed', scopeId: RID_A });
  const noVersion = loadAttestationForScope(JSON.stringify({
    kind: 'governed', scopeId: RID_A, ppeSelected: ALL_TRUE_PPE, ppeOther: [], prepared: ALL_TRUE_PREPARED,
  }), { kind: 'governed', scopeId: RID_A });
  check('8 missing or malformed stored scope loads empty',
    JSON.stringify(missing) === JSON.stringify(emptyAttestation())
    && JSON.stringify(malformed) === JSON.stringify(emptyAttestation())
    && JSON.stringify(wrongShape) === JSON.stringify(emptyAttestation())
    && JSON.stringify(noVersion) === JSON.stringify(emptyAttestation())
    && parseAttestationEnvelope('{') === null);
}

// 9. Scope replacement remains bounded; it does not accumulate one key per JSA.
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    ppeSelected: JSA_A_PPE, ppeOther: [], prepared: JSA_A_PREPARED,
  });
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_B }, {
    ppeSelected: { vest: true }, ppeOther: [], prepared: { sds: true },
  });
  const keys = store.keys();
  const env = parseAttestationEnvelope(store.snapshot()[ATTESTATION_DRAFT_KEY]);
  check('9 replacement stays one draft key and does not accumulate per JSA',
    keys.length === 1
    && keys[0] === ATTESTATION_DRAFT_KEY
    && keys[0] === STORAGE_KEYS.attestationDraft
    && env
    && env.scopeId === RID_B
    && env.ppeSelected.vest === true
    && !keys.some((k) => k.includes(RID_A) || k.includes(RID_B)));
}

// 10. Successful completion clears only the matching scope.
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    ppeSelected: JSA_A_PPE, ppeOther: JSA_A_OTHER, prepared: JSA_A_PREPARED,
  });
  const other = await applyAttestationCompletion(
    store,
    { kind: 'governed', scopeId: RID_B },
    'succeeded',
  );
  const stillA = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  const cleared = await applyAttestationCompletion(
    store,
    { kind: 'governed', scopeId: RID_A },
    'succeeded',
  );
  const after = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  check('10 successful completion clears only the matching scope',
    other === 'retained'
    && stillA.ppeSelected.hardHat === true
    && cleared === 'cleared'
    && JSON.stringify(after) === JSON.stringify(emptyAttestation())
    && !store.keys().includes(ATTESTATION_DRAFT_KEY));
}

// 11. Failed/pending completion does not destroy the frozen local save or queued snapshot.
{
  const frozenSave = JSON.stringify([{
    id: '1',
    governedRequestRef: RID_A,
    ppeSelected: JSA_A_PPE,
    ppeOtherItems: JSA_A_OTHER,
    prepared: JSA_A_PREPARED,
  }]);
  const frozenQueue = JSON.stringify([{
    requestId: RID_A,
    snapshot: { ppeSelected: JSA_A_PPE, prepared: JSA_A_PREPARED },
  }]);
  const store = memStore({
    [STORAGE_KEYS.saves]: frozenSave,
    '@jsa/governedArtifactQueue': frozenQueue,
  });
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    ppeSelected: JSA_A_PPE, ppeOther: JSA_A_OTHER, prepared: JSA_A_PREPARED,
  });
  const pending = await applyAttestationCompletion(
    store,
    { kind: 'governed', scopeId: RID_A },
    'pending_retry',
  );
  const failed = await applyAttestationCompletion(
    store,
    { kind: 'governed', scopeId: RID_A },
    'fail_closed',
  );
  const snap = store.snapshot();
  const draft = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  check('11 pending/failed completion retains draft, local save, and queue',
    pending === 'retained'
    && failed === 'retained'
    && snap[STORAGE_KEYS.saves] === frozenSave
    && snap['@jsa/governedArtifactQueue'] === frozenQueue
    && draft.ppeSelected.hardHat === true
    && draft.prepared.sds === true);
}

// 12. The saved governed snapshot contains exactly that JSA’s PPE/prepared values.
{
  const store = memStore();
  await writeAttestationDraft(store, { kind: 'governed', scopeId: RID_A }, {
    ppeSelected: JSA_A_PPE,
    ppeOther: JSA_A_OTHER,
    prepared: JSA_A_PREPARED,
  });
  const draft = await readAttestationDraft(store, { kind: 'governed', scopeId: RID_A });
  const payload = {
    jobActivityName: '',
    wellName: 'Gab 1',
    wells: [{ name: 'Gab 1' }],
    task: '',
    ppeSelected: draft.ppeSelected,
    ppeOtherItems: draft.ppeOther,
    prepared: draft.prepared,
    locations: ['Gab 1'],
    locationAcks: { 'Gab 1': true },
    signature: 'Mike Burger',
    signatureImage: PNG_B64,
    notes: '',
    pusher: '',
    otherInfo: '',
    date: '2026-08-12',
  };
  const adapted = adaptGovernedSnapshot(payload);
  check('12 saved governed snapshot freezes this JSA PPE/prepared only',
    adapted.ok === true
    && adapted.value.ppeSelected.hardHat === true
    && adapted.value.ppeSelected.gloves === false
    && adapted.value.ppeOtherItems[0] === 'face shield'
    && adapted.value.prepared.trained === true
    && adapted.value.prepared.toolsAndPpe === false
    && adapted.value.prepared.sds === true
    && !adapted.value.ppeSelected.glasses
    && !('signatureImage' in (buildAttestationEnvelope(
      { kind: 'governed', scopeId: RID_A },
      draft,
    ) || {})));
}

// 13. Global driver-signature preload and frozen signature behavior remain unchanged.
{
  const signoffSrc = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
  const helperSrc = readFileSync(join(root, 'services/sso/jsaAttestationScope.ts'), 'utf8');
  check('13 signature preload and frozen signature policy are unchanged',
    signoffSrc.includes('fetchDriverProfile')
    && signoffSrc.includes('profile?.signature')
    && signoffSrc.includes('setSignatureImage(profile.signature)')
    && signoffSrc.includes('signatureImage: signatureImage || \'\'')
    && !helperSrc.includes('signature')
    && !helperSrc.includes('fetchDriverProfile'));
}

// 14. Phase 5A authoritative well/job fields remain unchanged.
{
  const noType = decideGovernedJobPopulate({
    launchRequestId: RID_A,
    context: { requestId: RID_A, state: 'pending', intent: 'read', jobRef: JOB, wellName: 'Gab 1' },
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
  check('14 Phase 5A request-bound well/job fields are unchanged',
    frozen.source === 'governed_snapshot'
    && fields.wellName === 'Gab 1'
    && fields.jobActivityName === ''
    && fields.task === ''
    && !fields.wells[0].jobType
    && !/oil/.test(JSON.stringify({
      jobActivityName: fields.jobActivityName,
      task: fields.task,
      wells: fields.wells,
    })));
}

// 15. Standalone form behavior remains unchanged apart from starting each new JSA unchecked.
{
  const standalonePop = { kind: 'none', reason: 'no_launch' };
  const frozen = freezeGovernedJobForSave({
    populate: standalonePop,
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
  const store = memStore({
    [STORAGE_KEYS.ppeSelected]: JSON.stringify(ALL_TRUE_PPE),
    [STORAGE_KEYS.prepared]: JSON.stringify(ALL_TRUE_PREPARED),
  });
  const fresh = await readAttestationDraft(store, { kind: 'standalone', scopeId: SESS_B });
  check('15 standalone keeps legacy activity and starts a new session unchecked',
    frozen.source === 'nav_params'
    && fields.jobActivityName === 'oil'
    && fields.task === 'oil'
    && fields.wells[0].jobType === 'oil'
    && JSON.stringify(fresh) === JSON.stringify(emptyAttestation()));
}

{
  const store = globalAllTrueStore();
  await forgetLegacyAttestationKeys(store);
  const snap = store.snapshot();
  check('legacy global keys may be dropped but are never the load source',
    !snap[STORAGE_KEYS.ppeSelected]
    && !snap[STORAGE_KEYS.ppeOther]
    && !snap[STORAGE_KEYS.prepared]
    && decideAttestationScope({ source: null }).kind === 'none'
    && decideAttestationScope({ source: 'blocked' }).kind === 'none'
    && decideAttestationScope({ source: 'completed' }).kind === 'none');
}

const ppeSrc = readFileSync(join(root, 'app/ppe.tsx'), 'utf8');
const signoffSrc = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
const stepsSrc = readFileSync(join(root, 'app/steps.tsx'), 'utf8');
const idx = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');

check('screens resolve attestation from the protected handoff, not route requestId',
  ppeSrc.includes('decideAttestationScope')
  && signoffSrc.includes('decideAttestationScope')
  && ppeSrc.includes('governedRequestId: handoff.requestId')
  && signoffSrc.includes('governedRequestId: handoff.requestId')
  && !/decideAttestationScope\([\s\S]{0,240}params\.requestId/.test(ppeSrc)
  && !/decideAttestationScope\([\s\S]{0,240}params\.requestId/.test(signoffSrc));

check('standalone jsaSessionId is propagated home → steps → PPE → signoff',
  idx.includes('jsaSessionId: Date.now().toString()')
  && stepsSrc.includes('jsaSessionId')
  && /pathname:\s*"\/ppe"[\s\S]{0,800}jsaSessionId/.test(stepsSrc)
  && /pathname:\s*"\/signoff"[\s\S]{0,800}jsaSessionId/.test(ppeSrc));

check('legacy global PPE/prepared keys are not current-JSA authority',
  !/AsyncStorage\.getItem\(\s*STORAGE_KEYS\.ppeSelected/.test(ppeSrc)
  && !/AsyncStorage\.getItem\(\s*STORAGE_KEYS\.ppeOther/.test(ppeSrc)
  && !/AsyncStorage\.getItem\(\s*STORAGE_KEYS\.prepared/.test(signoffSrc)
  && !/AsyncStorage\.setItem\(\s*STORAGE_KEYS\.ppeSelected/.test(ppeSrc)
  && !/AsyncStorage\.setItem\(\s*STORAGE_KEYS\.prepared/.test(signoffSrc)
  && ppeSrc.includes('readAttestationDraft')
  && signoffSrc.includes('readAttestationDraft')
  && signoffSrc.includes('applyAttestationCompletion'));

check('governed unresolved attestation scope fail-closes Next/Submit',
  ppeSrc.includes("handoff.source === 'governed_snapshot' && scopeDec.kind !== 'ready'")
  && signoffSrc.includes("handoff.source === 'governed_snapshot' && scopeDec.kind !== 'ready'")
  && /const handleNext = \(\) => \{[\s\S]{0,80}jobGate !== 'ready'/.test(ppeSrc)
  && /const handleSubmit = \(\) => \{[\s\S]{0,80}jobGate !== 'ready'/.test(signoffSrc)
  && ppeSrc.includes('GovernedIsolationSurface')
  && signoffSrc.includes('GovernedIsolationSurface'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
