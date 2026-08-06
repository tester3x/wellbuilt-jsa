/**
 * vc51.9B — negotiated receipt-v2 submission binding.
 *
 * Run: node --experimental-strip-types tools/test-receiptV2.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReadReceiptFields, buildReadReceiptFieldsV2, parseWbtReadRequestParams,
} from '../services/wbtReadRequest.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const NOW = Date.parse('2026-08-06T15:00:00.000Z');
const RID = 'A'.repeat(20) + 'b'.repeat(20) + '-_c';
const baseParams = {
  readRequestId: RID, readRequestJobId: 'job_1', hash: 'hash-1',
  readRequestShift: '2026-08-06_060000', readRequestCompany: 'liquid-gold',
  readRequestOperator: 'SLAWSON', readRequestExpiresAt: new Date(NOW + 3600_000).toISOString(),
};

// ── negotiation: version comes from the REQUEST ───────────────────────────
{
  const v1 = parseWbtReadRequestParams({ ...baseParams, readRequestVersion: '1' }, NOW);
  check('v1 request parses as v1 (legacy path preserved)',
    v1.reason === 'ok' && v1.ctx.receiptVersion === 1 && v1.ctx.periodId === undefined);
}
{
  const v2 = parseWbtReadRequestParams({
    ...baseParams, readRequestVersion: '2',
    readRequestPeriodId: '2026-08-06_060000', readRequestMode: 'explicit_shift',
  }, NOW);
  check('v2 request parses with period claims',
    v2.reason === 'ok' && v2.ctx.receiptVersion === 2
    && v2.ctx.periodId === '2026-08-06_060000' && v2.ctx.workPeriodMode === 'explicit_shift');
}
check('v2 without period is malformed — never downgraded to v1',
  parseWbtReadRequestParams({ ...baseParams, readRequestVersion: '2', readRequestMode: 'explicit_shift' }, NOW).reason === 'no_period');
check('v2 with bad mode is malformed',
  parseWbtReadRequestParams({ ...baseParams, readRequestVersion: '2', readRequestPeriodId: 'p', readRequestMode: 'lunar' }, NOW).reason === 'bad_mode');
check('unknown version still refused',
  parseWbtReadRequestParams({ ...baseParams, readRequestVersion: '3' }, NOW).reason === 'unsupported_version');

// ── v2 field builder ─────────────────────────────────────────────────────
const v2ctx = parseWbtReadRequestParams({
  ...baseParams, readRequestVersion: '2',
  readRequestPeriodId: '2026-08-06_060000', readRequestMode: 'explicit_shift',
}, NOW).ctx;
{
  const f = buildReadReceiptFieldsV2(v2ctx, 'rec-1', new Date(NOW).toISOString(),
    { submissionPeriodId: '2026-08-06_060000', workPeriodMode: 'explicit_shift' });
  check('v2 fields: exact schema',
    JSON.stringify(Object.keys(f).sort()) === JSON.stringify([
      'companyId', 'completedAt', 'completionType', 'driverHash', 'jobDocId',
      'jsaRecordId', 'operator', 'requestId', 'requestPeriodId',
      'submissionPeriodId', 'receiptVersion', 'workPeriodMode'].sort()));
  check('v2 receiptVersion=2 and periods equal',
    f.receiptVersion.integerValue === '2'
    && f.requestPeriodId.stringValue === f.submissionPeriodId.stringValue);
  check('v2 stays honest: signed_submission only',
    f.completionType.stringValue === 'signed_submission'
    && !Object.keys(f).some((k) => /template|hazard|content|reviewed/i.test(k)));
  check('v2 has no v1 shiftId field (no field smuggling)', f.shiftId === undefined);
}
{
  let threw = false;
  try {
    buildReadReceiptFieldsV2(v2ctx, 'rec-1', new Date(NOW).toISOString(),
      { submissionPeriodId: '2026-08-05_060000', workPeriodMode: 'explicit_shift' });
  } catch { threw = true; }
  check('v2 builder refuses unequal request/submission periods', threw);
}
{
  const v1ctx = parseWbtReadRequestParams({ ...baseParams, readRequestVersion: '1' }, NOW).ctx;
  let threw = false;
  try {
    buildReadReceiptFieldsV2(v1ctx, 'rec-1', new Date(NOW).toISOString(),
      { submissionPeriodId: 'x', workPeriodMode: 'explicit_shift' });
  } catch { threw = true; }
  check('v2 builder refuses a v1 context (no version smuggling)', threw);
  const f1 = buildReadReceiptFields(v1ctx, 'rec-1', new Date(NOW).toISOString());
  check('v1 fields unchanged (transitional compatibility)',
    f1.receiptVersion.integerValue === '1' && f1.shiftId.stringValue === '2026-08-06_060000'
    && f1.requestPeriodId === undefined);
}

// ── source pins ───────────────────────────────────────────────────────────
const svc = readFileSync(join(root, 'services/wbtReadRequest.ts'), 'utf8');
check('writeReadReceipt refuses v2 without proven binding (downgrade resistance)',
  /READ_RECEIPT_VERSION_2 && !v2Binding/.test(svc));
const signoff = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
check('signoff proves the v2 binding before the receipt write',
  signoff.includes('proveV2Binding') && /proof = await proveV2Binding\(\);[\s\S]{0,120}writeReadReceipt/.test(signoff));
check('signoff resolves the period via the canonical binding service',
  signoff.includes("import('../services/requestPeriodBinding')"));
check('exactly one writeReadReceipt call site after signed submission',
  (signoff.match(/writeReadReceipt\(/g) || []).length === 1);
check('return link carries only request identity + negotiated version',
  /jsa-return\?requestId=\$\{encodeURIComponent\(readCtxAtSubmit\.requestId\)\}&version=\$\{readCtxAtSubmit\.receiptVersion === 2 \? 2 : 1\}/.test(signoff));
check('no raw request id in logs (redaction preserved)',
  !/console\.log\([^)]*readCtxAtSubmit\.requestId(?!\.slice)/.test(signoff));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
