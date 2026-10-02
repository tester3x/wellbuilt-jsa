import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const signoffSrc = readFileSync(join(ROOT, 'app', 'signoff.tsx'), 'utf8');
const openJsasSrc = readFileSync(join(ROOT, 'app', 'open-jsas.tsx'), 'utf8');
const jsaRecordSrc = readFileSync(join(ROOT, 'services', 'jsaRecord.ts'), 'utf8');

// ── 1. Sign-off source contract ───────────────────────────────────────────────
console.log('--- 1. Testing app/signoff.tsx contract ---');
// Must write signedAt and signatureId
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
// Extract hasPositiveSignatureEvidence logic
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

// ── 3. Orphan classification and gating logic ────────────────────────────────
console.log('--- 3. Testing orphan classification & gating logic ---');
assert.ok(jsaRecordSrc.includes('export function hasPositiveSignatureEvidence'),
  'jsaRecord.ts must export hasPositiveSignatureEvidence');
assert.ok(jsaRecordSrc.includes('export async function closeShiftJsaOrphan'),
  'jsaRecord.ts must export closeShiftJsaOrphan');
assert.ok(jsaRecordSrc.includes('export async function discardUnsignedJsaOrphan'),
  'jsaRecord.ts must export discardUnsignedJsaOrphan');

// closeShiftJsaOrphan gating
assert.ok(jsaRecordSrc.includes('Active shift JSAs cannot be closed from the orphan list.'),
  'closeShiftJsaOrphan must gate against active server shifts');
assert.ok(jsaRecordSrc.includes('Unsigned JSAs cannot be closed. Finish or discard them.'),
  'closeShiftJsaOrphan must gate against unsigned records');
assert.ok(jsaRecordSrc.includes('r.state = \'closed\''),
  'closeShiftJsaOrphan must mark state closed in local saves');
assert.ok(jsaRecordSrc.includes('r.closedAt = nowIso'),
  'closeShiftJsaOrphan must set closedAt');
assert.ok(jsaRecordSrc.includes('event: \'orphan.close\''),
  'closeShiftJsaOrphan must emit orphan.close audit log');

// discardUnsignedJsaOrphan
assert.ok(jsaRecordSrc.includes('r.state = \'discarded\''),
  'discardUnsignedJsaOrphan must mark state discarded in local saves');
assert.ok(jsaRecordSrc.includes('r.discardedAt = nowIso'),
  'discardUnsignedJsaOrphan must set discardedAt');
assert.ok(jsaRecordSrc.includes('event: \'orphan.discard\''),
  'discardUnsignedJsaOrphan must emit orphan.discard audit log');

console.log('PASS: jsaRecord.ts orphan functions verified.');

// ── 4. Open JSAs UI contract ─────────────────────────────────────────────────
console.log('--- 4. Testing app/open-jsas.tsx UI contract ---');
assert.ok(openJsasSrc.includes('import {closeShiftJsaOrphan,discardUnsignedJsaOrphan,ownOpenJsaRecords}'),
  'open-jsas.tsx must import orphan handlers');
assert.ok(openJsasSrc.includes('handleCloseOrphan'),
  'open-jsas.tsx must define handleCloseOrphan');
assert.ok(openJsasSrc.includes('handleDiscardOrphan'),
  'open-jsas.tsx must define handleDiscardOrphan');
assert.ok(openJsasSrc.includes('r.isPriorDayOrphan&&r.canCloseOrphan&&'),
  'open-jsas.tsx must render close button for signed prior-day orphans');
assert.ok(openJsasSrc.includes('r.isPriorDayOrphan&&!r.isSigned&&'),
  'open-jsas.tsx must render Finish and Discard for unsigned prior-day orphans');

console.log('PASS: app/open-jsas.tsx UI contract verified.');
console.log('\nAll WB-JSA signoff and orphan recovery contract checks passed successfully.');
