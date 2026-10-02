import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const signoffSrc = readFileSync(join(ROOT, 'app', 'signoff.tsx'), 'utf8');
const openJsasSrc = readFileSync(join(ROOT, 'app', 'open-jsas.tsx'), 'utf8');
const jsaRecordSrc = readFileSync(join(ROOT, 'services', 'jsaRecord.ts'), 'utf8');

// ── 1. Sign-off source contract ───────────────────────────────────────────────
console.log('--- 1. Testing app/signoff.tsx contract ---');
assert.ok(signoffSrc.includes('signedAt: { timestampValue: nowIso }'), 'signoff must write signedAt timestampValue');
assert.ok(signoffSrc.includes('signatureId: { stringValue: payload.id }'), 'signoff must write signatureId stringValue');

// Must conditionally handle pdfUrl (never empty string in updateMask or fields)
assert.ok(signoffSrc.includes('const hasPdfArtifact = typeof pdfUrl === \'string\' && pdfUrl.trim().length > 0;'),
  'signoff must verify pdfUrl is non-empty before writing');
assert.ok(signoffSrc.includes('if (hasPdfArtifact) {'), 'signoff must gate pdfUrl field path');
assert.ok(signoffSrc.includes('&updateMask.fieldPaths=pdfUrl'), 'signoff must conditionally add pdfUrl updateMask');

// Must stamp acknowledged: { booleanValue: true } and acknowledgedAt on form locations and existing locations
assert.ok(signoffSrc.includes('acknowledged: { booleanValue: true }'), 'signoff must mark locations acknowledged: { booleanValue: true }');
assert.ok(signoffSrc.includes('acknowledgedAt: { timestampValue: nowIso }'), 'signoff must mark locations acknowledgedAt timestampValue');
assert.ok(signoffSrc.includes('ensureAcknowledgedLocation'), 'signoff must ensure existing locations are acknowledged');

// Must sync both wells and locations fields in updateMask
assert.ok(signoffSrc.includes('&updateMask.fieldPaths=wells') && signoffSrc.includes('&updateMask.fieldPaths=locations'),
  'signoff must update both wells and locations arrays');

console.log('PASS: app/signoff.tsx contract verified.');

// ── 2. Signature evidence detection ──────────────────────────────────────────
console.log('--- 2. Testing hasPositiveSignatureEvidence ---');
function testSignatureEvidence(r) {
  if (!r) return false;
  return !!(
    r.signature ||
    r.signatureImage ||
    r.signedAt ||
    (typeof r.pdfUrl === 'string' && r.pdfUrl.trim().length > 0) ||
    r.state === 'signed' ||
    r.signatureCaptured
  );
}

assert.equal(testSignatureEvidence(null), false, 'null is not signed');
assert.equal(testSignatureEvidence({}), false, 'empty object is not signed');
assert.equal(testSignatureEvidence({ pdfUrl: '' }), false, 'empty pdfUrl is not signed');
assert.equal(testSignatureEvidence({ pdfUrl: '   ' }), false, 'whitespace pdfUrl is not signed');
assert.equal(testSignatureEvidence({ signedAt: '2026-10-01T12:00:00Z' }), true, 'signedAt counts as signed');
assert.equal(testSignatureEvidence({ signatureId: 'sig-123' }), false, 'bare signatureId without signedAt or signature is not positive evidence');
assert.equal(testSignatureEvidence({ signature: 'data:image/png;base64,abc' }), true, 'signature data counts');
assert.equal(testSignatureEvidence({ signatureImage: 'file:///path' }), true, 'signatureImage counts');
assert.equal(testSignatureEvidence({ pdfUrl: 'https://storage/jsa.pdf' }), true, 'non-empty pdfUrl counts');
assert.equal(testSignatureEvidence({ state: 'signed' }), true, 'state signed counts');
assert.equal(testSignatureEvidence({ signatureCaptured: true }), true, 'signatureCaptured counts');

console.log('PASS: hasPositiveSignatureEvidence contract verified.');

// ── 3. Open JSAs UI contract ─────────────────────────────────────────────────
console.log('--- 3. Testing app/open-jsas.tsx UI contract ---');
assert.ok(openJsasSrc.includes('import {closeShiftJsaOrphan,discardUnsignedJsaOrphan,ownOpenJsaRecords}'),
  'open-jsas.tsx must import orphan handlers');
assert.ok(openJsasSrc.includes('handleCloseOrphan'),
  'open-jsas.tsx must define handleCloseOrphan');
assert.ok(openJsasSrc.includes('handleDiscardOrphan'),
  'open-jsas.tsx must define handleDiscardOrphan');
assert.ok(openJsasSrc.includes('r.isPriorDayOrphan&&r.canCloseOrphan&&'),
  'open-jsas.tsx must render close button for signed prior-day orphans');
assert.ok(openJsasSrc.includes('r.isPriorDayOrphan&&!r.isSigned&&(r.canFinish||r.canDiscard)&&'),
  'open-jsas.tsx must guard Finish and Discard appropriately');
assert.ok(openJsasSrc.includes('r.canDiscard&&<TouchableOpacity'),
  'open-jsas.tsx must only render Discard button when r.canDiscard is true');

console.log('PASS: app/open-jsas.tsx UI contract verified.');

// ── 4. Executable authority & mutation tests ──────────────────────────────────
console.log('--- 4. Running executable authority & mutation tests ---');

// Build test environment
let currentSession = { uid: 'u1', generation: 'g1', companyId: 'c1', driverId: 'd1' };
let storageSaves = [];
let firestoreGetHandler = async (url) => ({ ok: true, status: 200, json: async () => ({}) });
let firestorePatchHandler = async (url, options) => ({ ok: true, status: 200, json: async () => ({}) });
let loggedEvents = [];

function createJsaRecordModule() {
  const m = { exports: {} };
  const transpiled = ts.transpileModule(jsaRecordSrc, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;

  new Function('require', 'module', 'exports', transpiled)((name) => {
    if (name === '@react-native-async-storage/async-storage') {
      return {
        default: {
          getItem: async (k) => JSON.stringify(storageSaves),
          setItem: async (k, v) => { storageSaves = JSON.parse(v); },
        },
        getItem: async (k) => JSON.stringify(storageSaves),
        setItem: async (k, v) => { storageSaves = JSON.parse(v); },
      };
    }
    if (name.endsWith('storageKeys')) return { STORAGE_KEYS: { saves: '@jsa/saves' } };
    if (name.endsWith('jsaGovernedAuthLive')) return { loadUsableGovernedSession: async () => currentSession };
    if (name.endsWith('jsaGovernedHistoryLookupLive')) {
      return {
        authenticatedGovernedFirestoreFetch: async (url, options) => {
          if (options?.method === 'PATCH') return firestorePatchHandler(url, options);
          return firestoreGetHandler(url);
        },
      };
    }
    if (name.endsWith('wbDiagLog')) {
      return {
        wbDiagLog: (ev) => { loggedEvents.push(ev); },
      };
    }
    throw new Error(`Unexpected import in test: ${name}`);
  }, m, m.exports);

  return m.exports;
}

const mod = createJsaRecordModule();

async function runTests() {
  const todayStr = new Date().toISOString().slice(0, 10);

  // Test 1: Active overnight shift
  console.log('Test 1: Active overnight shift...');
  storageSaves = [
    { id: 'overnight-1', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-15_night', date: '2026-09-15', state: 'signed', signedAt: '2026-09-15T22:00:00Z' },
  ];
  firestoreGetHandler = async (url) => ({
    ok: true,
    status: 200,
    json: async () => ({ fields: { currentShiftId: { stringValue: '2026-09-15_night' } } }),
  });

  const authOvernight = await mod.checkShiftOrphanAuthority(storageSaves[0], currentSession);
  assert.equal(authOvernight.status, 'active_shift', 'overnight shift matching currentShiftId must be active_shift');

  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('overnight-1'),
    /Active shift JSAs cannot be closed/,
    'closeShiftJsaOrphan must reject active overnight shift'
  );
  await assert.rejects(
    async () => mod.discardUnsignedJsaOrphan('overnight-1'),
    /Signed JSAs cannot be discarded|Active shift JSAs cannot be discarded/,
    'discardUnsignedJsaOrphan must reject active overnight shift'
  );

  const listOvernight = await mod.ownOpenJsaRecords();
  const rowOvernight = listOvernight.rows.find(r => r.id === 'overnight-1');
  assert.equal(rowOvernight.isPriorDayOrphan, false, 'active overnight shift must not be marked as prior-day orphan');
  assert.equal(rowOvernight.canCloseOrphan, false, 'active overnight shift cannot be closed');

  // Test 2: Today's shift
  console.log('Test 2: Today shift...');
  storageSaves = [
    { id: 'today-1', companyId: 'c1', driverId: 'd1', shiftId: `${todayStr}_100`, date: todayStr, state: 'signed', signedAt: `${todayStr}T10:00:00Z` },
  ];
  const authToday = await mod.checkShiftOrphanAuthority(storageSaves[0], currentSession);
  assert.equal(authToday.status, 'today_shift', "today's shift must return today_shift");

  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('today-1'),
    /Active shift JSAs cannot be closed/,
    "closeShiftJsaOrphan must reject today's shift"
  );
  await assert.rejects(
    async () => mod.discardUnsignedJsaOrphan('today-1'),
    /Signed JSAs cannot be discarded|Active shift JSAs cannot be discarded/,
    "discardUnsignedJsaOrphan must reject today's shift"
  );

  const listToday = await mod.ownOpenJsaRecords();
  const rowToday = listToday.rows.find(r => r.id === 'today-1');
  assert.equal(rowToday.isPriorDayOrphan, false, "today's shift must not be marked as prior-day orphan");
  assert.equal(rowToday.canCloseOrphan, false, "today's shift cannot be closed as orphan");

  // Test 3: Server 403 / 404 / timeout
  console.log('Test 3: Server 403 / 404 / timeout (Unavailable Authority)...');
  storageSaves = [
    { id: 'prior-signed', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-10_01', date: '2026-09-10', state: 'signed', signedAt: '2026-09-10T12:00:00Z' },
    { id: 'prior-unsigned', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-10_02', date: '2026-09-10', state: 'open' },
  ];

  // 3a. HTTP 403
  firestoreGetHandler = async () => ({ ok: false, status: 403 });
  const auth403 = await mod.checkShiftOrphanAuthority(storageSaves[0], currentSession);
  assert.equal(auth403.status, 'unverified', '403 must result in unverified status');
  assert.equal(auth403.httpStatus, 403);
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('prior-signed'),
    /Server shift authority could not be verified/,
    'closeShiftJsaOrphan must fail closed on HTTP 403'
  );
  await assert.rejects(
    async () => mod.discardUnsignedJsaOrphan('prior-unsigned'),
    /Server shift authority could not be verified/,
    'discardUnsignedJsaOrphan must fail closed on HTTP 403'
  );
  const list403 = await mod.ownOpenJsaRecords();
  assert.equal(list403.unverified, true, 'list must flag unverified on 403');
  const row403Signed = list403.rows.find(r => r.id === 'prior-signed');
  assert.equal(row403Signed.canCloseOrphan, false, 'unverified server read must NOT permit close');
  const row403Unsigned = list403.rows.find(r => r.id === 'prior-unsigned');
  assert.equal(row403Unsigned.canDiscard, false, 'unverified server read must NOT permit discard');

  // 3b. HTTP 404
  firestoreGetHandler = async () => ({ ok: false, status: 404 });
  const auth404 = await mod.checkShiftOrphanAuthority(storageSaves[0], currentSession);
  assert.equal(auth404.status, 'unverified', '404 must result in unverified status');
  assert.equal(auth404.httpStatus, 404);
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('prior-signed'),
    /Server shift authority could not be verified/,
    'closeShiftJsaOrphan must fail closed on HTTP 404'
  );
  await assert.rejects(
    async () => mod.discardUnsignedJsaOrphan('prior-unsigned'),
    /Server shift authority could not be verified/,
    'discardUnsignedJsaOrphan must fail closed on HTTP 404'
  );

  // 3c. Network error / timeout
  firestoreGetHandler = async () => { throw new Error('ETIMEDOUT'); };
  const authTimeout = await mod.checkShiftOrphanAuthority(storageSaves[0], currentSession);
  assert.equal(authTimeout.status, 'unverified', 'timeout must result in unverified status');
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('prior-signed'),
    /Server shift authority could not be verified/,
    'closeShiftJsaOrphan must fail closed on network timeout'
  );
  await assert.rejects(
    async () => mod.discardUnsignedJsaOrphan('prior-unsigned'),
    /Server shift authority could not be verified/,
    'discardUnsignedJsaOrphan must fail closed on network timeout'
  );

  // Test 4: Stale list item
  console.log('Test 4: Stale list item...');
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('non-existent-id'),
    /JSA record not found/,
    'closeShiftJsaOrphan must reject non-existent id'
  );
  storageSaves.push({ id: 'already-closed', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-08_01', state: 'closed' });
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('already-closed'),
    /JSA is already closed/,
    'closeShiftJsaOrphan must reject already closed item'
  );

  // Test 5: Session switch
  console.log('Test 5: Session switch...');
  firestoreGetHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => {
      // Simulate session changed while network call was inflight
      currentSession = { uid: 'u2', generation: 'g2', companyId: 'c1', driverId: 'd1' };
      return { fields: { currentShiftId: { stringValue: '' } } };
    },
  });
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('prior-signed'),
    /Session changed during verification/,
    'closeShiftJsaOrphan must reject session switch during verification'
  );
  // Restore session
  currentSession = { uid: 'u1', generation: 'g1', companyId: 'c1', driverId: 'd1' };

  // Test 6: Forged signed flag
  console.log('Test 6: Forged signed flag...');
  storageSaves = [
    { id: 'forged-item', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-09_01', date: '2026-09-09', state: 'open' },
  ];
  firestoreGetHandler = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ fields: { currentShiftId: { stringValue: '' } } }),
  });
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan({ id: 'forged-item', isSigned: true, state: 'signed' }),
    /Unsigned JSAs cannot be closed/,
    'closeShiftJsaOrphan must reject forged signed flag by verifying storage record'
  );

  // Test 7: Unsigned draft
  console.log('Test 7: Unsigned draft...');
  storageSaves = [
    { id: 'signed-rec', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-09_02', date: '2026-09-09', state: 'signed', signedAt: '2026-09-09T10:00:00Z' },
    { id: 'unsigned-draft', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-09_03', date: '2026-09-09', state: 'open' },
  ];
  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('unsigned-draft'),
    /Unsigned JSAs cannot be closed/,
    'closeShiftJsaOrphan must reject unsigned draft'
  );
  await assert.rejects(
    async () => mod.discardUnsignedJsaOrphan('signed-rec'),
    /Signed JSAs cannot be discarded/,
    'discardUnsignedJsaOrphan must reject signed record'
  );
  // Discard truly unsigned draft
  loggedEvents = [];
  await mod.discardUnsignedJsaOrphan('unsigned-draft', 'driver_abandoned');
  const discarded = storageSaves.find(r => r.id === 'unsigned-draft');
  assert.equal(discarded.state, 'discarded', 'record must transition to discarded state');
  assert.equal(discarded.discardReason, 'driver_abandoned');
  assert.ok(discarded.discardedAt, 'discardedAt must be set');
  const discardEvent = loggedEvents.find(e => e.event === 'orphan.discard');
  assert.ok(discardEvent, 'orphan.discard audit log must be emitted');

  // Test 8: Valid signed orphan
  console.log('Test 8: Valid signed orphan...');
  storageSaves = [
    { id: 'valid-signed-orphan', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-09_04', date: '2026-09-09', state: 'signed', signedAt: '2026-09-09T10:00:00Z' },
  ];
  let patchCalled = false;
  firestorePatchHandler = async (url, options) => {
    patchCalled = true;
    assert.ok(url.includes('jsa_day_status/d1_2026-09-09_04'), 'patch url must target correct document');
    const body = JSON.parse(options.body);
    assert.equal(body.fields.state.stringValue, 'closed', 'patch must set state closed');
    assert.ok(body.fields.closedAt.timestampValue, 'patch must set closedAt');
    return { ok: true, status: 200, json: async () => ({}) };
  };

  loggedEvents = [];
  await mod.closeShiftJsaOrphan('valid-signed-orphan');
  assert.ok(patchCalled, 'Firestore PATCH must be executed');
  const closedRecord = storageSaves.find(r => r.id === 'valid-signed-orphan');
  assert.equal(closedRecord.state, 'closed', 'local record must be marked closed in storage');
  assert.ok(closedRecord.closedAt, 'closedAt must be set on local record');
  const closeEvent = loggedEvents.find(e => e.event === 'orphan.close' && e.result === 'ok');
  assert.ok(closeEvent, 'orphan.close audit log must be emitted');

  // Test 9: Remote PATCH failure
  console.log('Test 9: Remote PATCH failure...');
  storageSaves = [
    { id: 'patch-fail-orphan', companyId: 'c1', driverId: 'd1', shiftId: '2026-09-09_05', date: '2026-09-09', state: 'signed', signedAt: '2026-09-09T10:00:00Z' },
  ];
  firestorePatchHandler = async () => ({ ok: false, status: 500 });
  loggedEvents = [];

  await assert.rejects(
    async () => mod.closeShiftJsaOrphan('patch-fail-orphan'),
    /Failed to close JSA on server \(HTTP 500\)\. Local record preserved for retry\./,
    'closeShiftJsaOrphan must throw and preserve local record when remote PATCH fails'
  );

  const preservedRecord = storageSaves.find(r => r.id === 'patch-fail-orphan');
  assert.equal(preservedRecord.state, 'signed', 'local record MUST NOT be closed when remote PATCH fails');
  assert.equal(preservedRecord.closedAt, undefined, 'closedAt must not be set on failed close');
  const failedEvent = loggedEvents.find(e => e.event === 'orphan.close' && e.result === 'error');
  assert.ok(failedEvent, 'orphan.close error audit log must be emitted');

  // Test 10: Retry
  console.log('Test 10: Retry after remote PATCH failure...');
  firestorePatchHandler = async () => ({ ok: true, status: 200, json: async () => ({}) });
  loggedEvents = [];

  await mod.closeShiftJsaOrphan('patch-fail-orphan');
  const retriedRecord = storageSaves.find(r => r.id === 'patch-fail-orphan');
  assert.equal(retriedRecord.state, 'closed', 'local record must transition to closed upon successful retry');
  assert.ok(retriedRecord.closedAt, 'closedAt must be set on retry');
  const retryEvent = loggedEvents.find(e => e.event === 'orphan.close' && e.result === 'ok');
  assert.ok(retryEvent, 'orphan.close ok audit log must be emitted on retry');

  console.log('All 10 executable authority and mutation tests passed successfully!');
}

runTests().then(() => {
  console.log('\nAll WB-JSA signoff and orphan recovery contract checks passed successfully.');
}).catch((err) => {
  console.error('\nFAIL:', err);
  process.exitCode = 1;
});
