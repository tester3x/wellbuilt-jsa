/**
 * Receipt-backed submission honesty (8/6, contract v1).
 *
 * RED-FIRST vs the pre-receipt tree: the success modal appeared before —
 * and regardless of — every cloud write, and no receipt existed.
 *
 * Pins the awaited-write boundary for WB-T receipt-backed submissions:
 * core jsas persistence AWAITED → receipt AWAITED (GET-first idempotent)
 * → only then success UI + the jsa-return link; failures keep the driver
 * on signoff with entries + signature intact and an honest Retry reusing
 * the SAME payload id. Ordinary (non-WB-T) submissions keep their
 * established flow (tightened separately).
 *
 * Run: node --experimental-strip-types tools/test-wbtReceiptSubmission.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

function expect(cond, msg) { if (!cond) throw new Error(msg); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const so = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
const svc = readFileSync(join(root, 'services/wbtReadRequest.ts'), 'utf8');

// The receipt flow is resolved ONCE at submit; expired context is cleared
// and demoted to an ordinary flow (never a silent shift-only claim).
expect(so.includes('const receiptFlow = isReadRequestContextUsable(readCtxAtSubmit, Date.now())'),
  'receipt flow resolved once at submit');
expect(so.includes('stored request expired before submit — ordinary flow, no receipt'),
  'expired context demotes honestly');

// Awaited boundary + ordering: core jsas → receipt → clear → success.
{
  const region = so.slice(so.indexOf('if (receiptFlow && readCtxAtSubmit) {'), so.indexOf('// Ordinary flow (8/6 honesty)'));
  expect(region.length > 200, 'receipt-flow region located');
  const iCore = region.indexOf('await runCloudPersist()');
  const iGate = region.indexOf('if (!core.jsasOk) return false;');
  // vc51.9B: the canonical period proof sits between the durable core
  // write and the receipt — a v2 request without a proven binding never
  // produces a receipt.
  const iProof = region.indexOf('await proveV2Binding();');
  const iReceipt = region.indexOf('await writeReadReceipt(readCtxAtSubmit, payload.id, proof.binding)');
  const iClear = region.indexOf('await clearReadRequestContext();');
  const iModal = region.indexOf('setShowCompleteModal(true);');
  expect(iCore >= 0 && iGate > iCore && iProof > iGate && iReceipt > iProof && iClear > iReceipt && iModal > iClear,
    'order: await core jsas → gate → period proof → await receipt → clear context → success UI');
  expect(region.includes('jsa-return?requestId=') && /&version=\$\{readCtxAtSubmit\.receiptVersion === 2 \? 2 : 1\}/.test(region),
    'return link carries only the request id + negotiated version (lookup hint)');
  expect(region.includes('Submission Not Complete') && region.includes("text: t('Retry')"),
    'failure shows an honest blocking Retry — no success modal, no receipt');
  expect(region.includes('return; // receipt flow fully handled'),
    'the legacy immediate-success path cannot run for receipt flows');
  expect(!region.includes('dismissAll'),
    'failure keeps the driver on signoff (entries + signature intact)');
}

// The core outcome is the jsas write, set only on a successful response;
// PDF/day-status/mirror/completions stay ancillary and unclaimed.
expect(so.includes('let coreJsasOk = false;') && so.includes('coreJsasOk = true;'),
  'core outcome tracked from the actual jsas response');
expect(so.includes('return { jsasOk: coreJsasOk };'),
  'the cloud closure reports the core outcome');
expect(so.includes('ANCILLARY: best-effort, logged,'),
  'ancillary-write decision documented in place');
// Ordinary flow (own commit): the smallest awaited boundary — the core
// jsas write — and an honest modal. No false success anywhere:
// completeCloudPending switches the completion copy to saved-on-device,
// and the top-level failure catch forces the HONEST modal (no return
// link, no receipt, WB-T stays gated).
expect(so.includes('const core = await runCloudPersist().catch(() => ({ jsasOk: false }));')
  && so.includes('setCompleteCloudPending(!core.jsasOk);'),
  'ordinary submissions await the core outcome');
expect(so.includes("cloud sync hasn't finished yet"),
  'the completion modal tells the truth about the cloud outcome');
expect(so.includes('forcing HONEST modal') && !so.includes("forcing modal:'"),
  'the forced failure modal no longer claims success');
expect(!so.includes('void runCloudPersist();'),
  'no fire-and-forget success path remains');

// Receipt writer: called only after core persistence (contract comment),
// GET-first idempotent, never without the submission id.
expect(svc.includes('MUST be called only after the core'),
  'receipt writer contract documented');
{
  const w = svc.slice(svc.indexOf('export async function writeReadReceipt'));
  expect(w.indexOf('const g = await fetch(url') < w.indexOf("method: 'PATCH'"),
    'GET-first idempotence before the PATCH');
  expect(w.includes('receipt already exists — idempotent success'),
    'an existing receipt is success, never a duplicate');
  expect(w.includes('|| !jsaRecordId) return false;'),
    'no receipt without the core submission id');
}

console.log('wbtReceiptSubmission tests passed');
