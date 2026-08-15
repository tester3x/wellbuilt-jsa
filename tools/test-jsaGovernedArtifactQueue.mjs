/**
 * Governed artifact client + durable queue matrix.
 * Run: node --experimental-strip-types tools/test-jsaGovernedArtifactQueue.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adaptGovernedSnapshot,
  decodeDrawnPng,
  persistRequestBody,
  persistBodyHasNoAuthority,
  vc13SaveProvesExplicitSubmit,
  saveAlreadyPersistedArtifact,
  classifyArtifactStatus,
  decideSubmitGate,
  decideAfterQueue,
  freezeQueueItem,
  applyStatus,
  scanSavesForRecovery,
  recoverSaveAsQueueCandidate,
  isDraftRecord,
  mayCompleteFromQueue,
  mayPersistFromQueue,
  requiredSubmitOrder,
  nextBackoffMs,
  parseQueueItem,
  removeQueueItem,
  upsertQueueItem,
  parsePersistResult,
  classifyPersistError,
  commitGovernedAfterLocalSaveWithStore,
  enqueueFrozenSnapshot,
  settleArtifactQueue,
  resetArtifactSingleFlightForTests,
} from '../services/sso/jsaArtifactSnapshot.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID = 'R'.repeat(43);
const RID2 = 'Q'.repeat(43);
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PRINTED = 'Mike Burger';

function vc13Save(extra = {}) {
  return {
    id: String(1_786_741_459_475),
    timestamp: '2026-08-14T21:04:25.000Z',
    driverName: 'Mike',
    driverHash: 'legacy-hash-not-authority',
    driverId: 'legacy-hash-not-authority',
    driverLegalName: 'Michael Burger',
    companyId: 'co-should-not-go',
    shiftId: '2026-08-12_182535',
    truckNumber: '19317',
    jobActivityName: 'Production Water',
    pusher: 'Nile',
    wellName: 'Gab 1',
    wells: [{ name: 'Gab 1', jobType: 'Production Water' }],
    otherInfo: '',
    date: '2026-08-12',
    ppeSelected: { hardHat: true, gloves: true },
    ppeOtherItems: [],
    locations: ['Gab 1'],
    locationAcks: { 'Gab 1': true },
    prepared: { trained: true, toolsAndPpe: true, sds: true },
    notes: 'clear',
    signature: PRINTED,
    signatureImage: PNG_B64,
    governedRequestRef: RID,
    ...extra,
  };
}

function memStore(opts = {}) {
  const world = {
    queue: [],
    saves: opts.saves || [],
    stamps: [],
    completes: [],
    persists: [],
    logs: [],
    now: 1_700_000_000_000,
    completeImpl: opts.completeImpl || (async () => ({ kind: 'completed', reused: false, action: 'read_and_acknowledged' })),
    persistImpl: opts.persistImpl || (async () => ({ ok: true, reused: false })),
  };
  const store = {
    nowMs: () => world.now,
    loadQueue: async () => world.queue.map((i) => ({ ...i, snapshot: { ...i.snapshot } })),
    saveQueue: async (items) => { world.queue = items; },
    loadSaves: async () => world.saves,
    stampSave: async (id, stamp) => { world.stamps.push({ id, stamp }); },
    complete: async (requestId, action, localRecordId) => {
      world.completes.push({ requestId, action, localRecordId });
      return world.completeImpl(requestId, action);
    },
    persist: async (requestId, snapshot) => {
      world.persists.push({ requestId, snapshot });
      return world.persistImpl(requestId, snapshot);
    },
    log: (outcome) => { world.logs.push(outcome); },
  };
  return { world, store };
}

const adapted = adaptGovernedSnapshot(vc13Save());
check('1 adapter uses signatureImage as the drawn PNG',
  adapted.ok && adapted.value.signature.data === PNG_B64
  && adapted.value.signature.mimeType === 'image/png');
check('2 printed name and PNG are separate values',
  adapted.ok && adapted.value.printedName === PRINTED
  && adapted.value.signature.data !== adapted.value.printedName
  && decodeDrawnPng(PRINTED).ok === false);
check('3 persist payload contains no authority fields',
  adapted.ok && persistBodyHasNoAuthority(persistRequestBody(RID, adapted.value).value)
  && !('companyId' in adapted.value)
  && !('wellName' in adapted.value)
  && !('jobRef' in adapted.value)
  && !('shiftId' in adapted.value)
  && !('driverId' in adapted.value));

{
  const callables = readFileSync(join(root, 'services/sso/jsaArtifactCallables.ts'), 'utf8');
  check('4 client uses authenticated httpsCallable transport',
    callables.includes("httpsCallable(")
    && callables.includes("'jsaPersistGovernedArtifact'")
    && callables.includes('getFunctions(getApp())'));
  check('5 no API-key PATCH or direct Firestore artifact write',
    !/AIzaSy|firestore\.googleapis|collection\(\s*['"]jsa_governed_artifacts/.test(callables)
    && !/PATCH/.test(callables)
    && !/passcodeHash/.test(callables));
}

{
  const order = requiredSubmitOrder();
  check('6-7 required order is save then queue then complete',
    order.indexOf('local_save') < order.indexOf('enqueue')
    && order.indexOf('enqueue') < order.indexOf('complete')
    && order.indexOf('complete') < order.indexOf('persist'));
  check('8 complete is not called if local save fails',
    decideSubmitGate({ localSaveOk: false, snapshotOk: true }).ok === false
    && decideSubmitGate({ localSaveOk: false, snapshotOk: true }).refusal === 'local_save_failed');
  check('9 complete is not called if queue persistence fails',
    decideAfterQueue(false).mayComplete === false
    && decideAfterQueue(true).mayComplete === true);
}

{
  const { world, store } = memStore();
  const snap = adapted.value;
  const out = await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: '1',
    snapshot: snap, localSaveOk: true,
  });
  check('10 complete success leads to artifact persist',
    out.kind === 'completed'
    && world.completes.length === 1
    && world.persists.length === 1
    && world.completes[0].action === 'read_and_acknowledged');
}

{
  const { world, store } = memStore({
    completeImpl: async () => ({ kind: 'completed', reused: true, action: 'read_and_acknowledged' }),
  });
  const out = await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: '1',
    snapshot: adapted.value, localSaveOk: true,
  });
  check('11 identical complete reuse leads to artifact persist',
    out.kind === 'completed' && out.reused === true && world.persists.length === 1);
}

{
  const { world, store } = memStore();
  await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: 'keep-me',
    snapshot: adapted.value, localSaveOk: true,
  });
  check('12 artifact create records success and clears only its queue item',
    world.stamps.length === 1
    && world.stamps[0].stamp.persisted === true
    && world.stamps[0].stamp.reused === false
    && world.queue.length === 0);
}

{
  const { world, store } = memStore({
    persistImpl: async () => ({ ok: true, reused: true }),
  });
  await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: '1',
    snapshot: adapted.value, localSaveOk: true,
  });
  check('13 artifact reused records success and clears only its queue item',
    world.stamps[0].stamp.reused === true && world.queue.length === 0);
}

{
  const { world, store } = memStore({
    completeImpl: async () => { throw new Error('died'); },
  });
  const queued = await enqueueFrozenSnapshot(store, {
    requestId: RID, localRecordId: '1', snapshot: adapted.value, action: 'read_and_acknowledged',
  });
  check('14a process death after queue/before complete keeps the item',
    queued && world.queue.length === 1 && world.queue[0].completeState === 'unsent');
  world.completeImpl = async () => ({ kind: 'completed', reused: true, action: 'read_and_acknowledged' });
  resetArtifactSingleFlightForTests();
  await settleArtifactQueue(store);
  check('14 process death after queue/before complete recovers safely',
    world.completes.length === 1
    && world.persists.length === 1
    && world.queue.length === 0);
}

{
  const { world, store } = memStore({
    persistImpl: async () => ({ ok: false, status: 'network' }),
  });
  await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: '1',
    snapshot: adapted.value, localSaveOk: true,
  });
  check('15 process death after complete/before persist retains the queue',
    world.completes.length === 1 && world.queue.length === 1
    && world.queue[0].completeState === 'completed'
    && world.queue[0].artifactState === 'unsent');
  world.persistImpl = async () => ({ ok: true, reused: false });
  world.now += 5_000;
  resetArtifactSingleFlightForTests();
  await settleArtifactQueue(store);
  check('15b persist recovers after complete',
    world.persists.length === 2 && world.queue.length === 0);
}

{
  const { world, store } = memStore({
    persistImpl: async () => ({ ok: true, reused: true }),
  });
  await enqueueFrozenSnapshot(store, {
    requestId: RID, localRecordId: '1', snapshot: adapted.value, action: 'read_and_acknowledged',
  });
  world.queue[0] = { ...world.queue[0], completeState: 'completed', lastStatus: 'persist_unsent' };
  await store.saveQueue(world.queue);
  resetArtifactSingleFlightForTests();
  await settleArtifactQueue(store);
  check('16 process death after remote artifact/before dequeue accepts reused',
    world.persists.length === 1 && world.stamps[0].stamp.reused === true && world.queue.length === 0);
}

{
  const { world, store } = memStore({
    persistImpl: async () => ({ ok: false, status: 'auth_unavailable' }),
  });
  await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: '1',
    snapshot: adapted.value, localSaveOk: true,
  });
  check('17 authentication loss retains the queue',
    world.queue.length === 1 && world.queue[0].artifactState === 'unsent'
    && world.queue[0].lastStatus === 'auth_unavailable');
}

{
  const item = applyStatus(
    freezeQueueItem({
      requestId: RID, localRecordId: '1', snapshot: adapted.value,
      action: 'read_and_acknowledged', nowMs: 1000,
    }),
    'network',
    1000,
  );
  check('18 transient failure retains with bounded backoff',
    item.artifactState === 'unsent'
    && item.attemptCount === 1
    && item.nextAttemptAtMs === 1000 + nextBackoffMs(0)
    && nextBackoffMs(8) === 120_000);
}

{
  const item = applyStatus(
    freezeQueueItem({
      requestId: RID, localRecordId: '1', snapshot: adapted.value,
      action: 'read_and_acknowledged', nowMs: 1000,
    }),
    'conflict',
    1000,
  );
  check('19 conflict becomes blocked and remains inspectable',
    item.artifactState === 'blocked'
    && item.lastStatus === 'conflict'
    && classifyArtifactStatus('conflict') === 'blocked');
}

{
  resetArtifactSingleFlightForTests();
  let persistCalls = 0;
  const { world, store } = memStore({
    persistImpl: async () => {
      persistCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, reused: persistCalls > 1 };
    },
  });
  await enqueueFrozenSnapshot(store, {
    requestId: RID, localRecordId: '1', snapshot: adapted.value, action: null,
  });
  await Promise.all([settleArtifactQueue(store), settleArtifactQueue(store)]);
  check('20 concurrent resume paths produce one in-flight effect per requestId',
    persistCalls === 1 && world.queue.length === 0);
}

{
  const draft = { id: 'draft-1', signature: PRINTED, signatureImage: PNG_B64, notes: 'wip' };
  const found = recoverSaveAsQueueCandidate(draft, new Set());
  check('21 drafts are never completed or migrated',
    found.ok === false && isDraftRecord(draft) === true && !mayCompleteFromQueue({
      submitCommitted: true, completeState: 'unsent', action: null,
    }));
}

{
  const legacy = { id: 'old', signature: PRINTED, signatureImage: PNG_B64, companyId: 'co' };
  const standalone = recoverSaveAsQueueCandidate(legacy, new Set());
  check('22 standalone/legacy saves are not migrated',
    standalone.ok === false && standalone.reason === 'not_governed');
}

{
  const real = vc13Save();
  const found = recoverSaveAsQueueCandidate(real, new Set());
  const scanned = scanSavesForRecovery([real, { id: 'noise' }], []);
  check('23 generic recovery fixture matching vc13 schema queues without hardcoded IDs',
    found.ok
    && found.requestId === real.governedRequestRef
    && found.localRecordId === real.id
    && found.snapshot.printedName === PRINTED
    && found.snapshot.signature.data === PNG_B64
    && scanned.length === 1
    && vc13SaveProvesExplicitSubmit(real)
    && !saveAlreadyPersistedArtifact(real));
}

{
  const live = readFileSync(join(root, 'services/sso/jsaArtifactLive.ts'), 'utf8');
  const queue = readFileSync(join(root, 'services/sso/jsaArtifactSnapshot.ts'), 'utf8');
  check('24 recovery does not remint or register',
    !/jsaRegisterReadRequest|mint|remint/.test(live)
    && !/jsaRegisterReadRequest|mint|remint/.test(queue));
  check('25 recovery does not change terminal action',
    !/action:\s*'read_completed'/.test(live)
    && scannedActionUnchanged());
  function scannedActionUnchanged() {
    const item = scanSavesForRecovery([vc13Save()], [])[0];
    return item.action === null || item.action === 'read_and_acknowledged';
  }
}

{
  const files = [
    'jsaArtifactSnapshot.ts',
    'jsaArtifactCallables.ts', 'jsaArtifactLive.ts',
  ];
  let jsas = false;
  for (const f of files) {
    const src = readFileSync(join(root, 'services/sso', f), 'utf8');
    if (/['"]jsas['"]|\/jsas\//.test(src)) jsas = true;
  }
  check('26 no legacy jsas write occurs', jsas === false);
}

{
  const files = [
    'jsaArtifactSnapshot.ts',
    'jsaArtifactCallables.ts', 'jsaArtifactLive.ts',
  ];
  let leak = false;
  for (const f of files) {
    const src = readFileSync(join(root, 'services/sso', f), 'utf8');
    src.split(/\r?\n/).forEach((line) => {
      if (!/console\.(log|warn|error)/.test(line)) return;
      if (/requestId|printedName|signature|dataBase64|token|legalName/.test(line)
        && !/outcome|tag/.test(line)) leak = true;
      if (/requestId:/.test(line)) leak = true;
    });
  }
  check('27 signature bytes, printed name, requestId, and tokens are absent from logs',
    leak === false);
}

{
  const lifecycle = readFileSync(join(root, 'services/sso/jsaRequestLifecycle.ts'), 'utf8');
  const getSrc = readFileSync(join(root, 'services/sso/jsaRequestCallables.ts'), 'utf8');
  check('28 existing get/complete modules are not rewritten onto persist',
    getSrc.includes('jsaGetReadRequest')
    && getSrc.includes('jsaCompleteReadRequest')
    && lifecycle.includes('export async function completeAfterLocalSave')
    && !getSrc.includes('jsaPersistGovernedArtifact'));
}

check('adapter refuses using printed name as PNG',
  decodeDrawnPng(PRINTED).ok === false);
check('payload builder rejects a non-requestId',
  persistRequestBody('short', adapted.value).ok === false);
check('already-persisted save is not requeued',
  recoverSaveAsQueueCandidate({
    ...vc13Save(),
    governedArtifact: { persisted: true, reused: false, persistedAtMs: 1 },
  }, new Set()).reason === 'already_persisted');
check('parsePersistResult rejects signature bytes in the response',
  parsePersistResult({
    requestId: RID, reused: false, schemaVersion: 1,
    snapshotHash: 'a'.repeat(64), artifactWrittenAtMs: 1,
    signature: { mimeType: 'image/png', encoding: 'base64', byteSize: 1, sha256: 'b'.repeat(64), dataBase64: PNG_B64 },
  }).ok === false);
check('rate-limit classifies retryable',
  classifyPersistError({ code: 'functions/resource-exhausted' }) === 'rate_limited'
  && classifyArtifactStatus('rate_limited') === 'retryable');
check('local save fail never reaches enqueue in the gate',
  decideSubmitGate({ localSaveOk: false, snapshotOk: true }).next === undefined);

{
  const { world, store } = memStore();
  const failSave = await commitGovernedAfterLocalSaveWithStore(store, {
    requestId: RID, action: 'read_and_acknowledged', localRecordId: '1',
    snapshot: adapted.value, localSaveOk: false,
  });
  check('save-fail short-circuits before complete and persist',
    failSave.kind === 'fail_closed' && world.completes.length === 0 && world.persists.length === 0);
}

{
  const callables = readFileSync(join(root, 'services/sso/jsaArtifactCallables.ts'), 'utf8');
  const live = readFileSync(join(root, 'services/sso/jsaArtifactLive.ts'), 'utf8');
  check('no anonymous or passcode fallback on persist',
    !/signInAnonymously|passcode|manual.login|signInWithCustomToken/.test(callables)
    && !/signInAnonymously|passcodeHash/.test(live));
}

check('queue item parser rejects authority-only blobs',
  parseQueueItem({ schemaVersion: 1, requestId: RID, companyId: 'x' }) === null);
check('upsert replaces the same requestId only',
  upsertQueueItem(
    [freezeQueueItem({ requestId: RID, localRecordId: '1', snapshot: adapted.value, action: 'acknowledged', nowMs: 1 })],
    freezeQueueItem({ requestId: RID, localRecordId: '1', snapshot: adapted.value, action: 'acknowledged', nowMs: 2 }),
  ).length === 1);
check('removeQueueItem is requestId-scoped',
  removeQueueItem([
    freezeQueueItem({ requestId: RID, localRecordId: '1', snapshot: adapted.value, action: null, nowMs: 1 }),
    freezeQueueItem({ requestId: RID2, localRecordId: '2', snapshot: adapted.value, action: null, nowMs: 1 }),
  ], RID).length === 1);
check('mayPersist after complete, not from a draft-like unsent without action complete permission',
  mayPersistFromQueue({ submitCommitted: true, artifactState: 'unsent', completeState: 'completed', action: 'acknowledged' }) === true
  && mayCompleteFromQueue({ submitCommitted: true, completeState: 'unsent', action: 'acknowledged' }) === true);

const signoff = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
check('signoff still returns before legacy jsas write on governed path',
  signoff.indexOf('commitGovernedAfterLocalSave') < signoff.indexOf('runCloudPersist')
  && /if \(governedActive && governedCtx/.test(signoff));
check('signoff maps signatureImage not signature as the PNG',
  /adaptGovernedSnapshot\(payload\)/.test(signoff));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
