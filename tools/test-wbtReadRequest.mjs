/**
 * WB-T fresh-read receipt request lifecycle (8/6, contract v1).
 *
 * RED-FIRST: fails before the receipt work — no request service existed
 * and neither /start entry captured request identity.
 *
 * Proves: param validation (malformed requests are discarded, never
 * silently converted into completion claims), explicit-restart replace/
 * clear semantics, durable-storage survival across the whole flow (the
 * context lives in AsyncStorage — no route-param threading to lose), and
 * the receipt field builder (identity echo + completionType, no
 * content-review claims).
 *
 * Run: node --experimental-strip-types tools/test-wbtReadRequest.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseWbtReadRequestParams,
  isReadRequestContextUsable,
  buildReadReceiptFields,
  READ_RECEIPT_VERSION,
} from '../services/wbtReadRequest.ts';

function expect(cond, msg) { if (!cond) throw new Error(msg); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const NOW = Date.parse('2026-08-06T09:00:00Z');
const RID = 'A'.repeat(20) + 'b'.repeat(20) + '-_c';
const good = {
  hash: 'da561bc4',
  readRequestVersion: '1',
  readRequestId: RID,
  readRequestJobId: 'INV_123',
  readRequestGroupId: 'hg9',
  readRequestCompany: 'liquid-gold',
  readRequestShift: '2026-08-06_060000',
  readRequestOperator: 'SLAWSON',
  readRequestExpiresAt: new Date(NOW + 60 * 60_000).toISOString(),
};

// ── Param validation matrix ─────────────────────────────────────────────────
{
  const ok = parseWbtReadRequestParams(good, NOW);
  expect(ok.ctx && ok.reason === 'ok', 'valid request parses');
  expect(ok.ctx.requestId === RID && ok.ctx.jobDocId === 'INV_123'
    && ok.ctx.haulGroupId === 'hg9' && ok.ctx.driverHash === 'da561bc4'
    && ok.ctx.shiftId === good.readRequestShift && ok.ctx.receiptVersion === READ_RECEIPT_VERSION,
    'context carries the full request identity');
  expect(parseWbtReadRequestParams({ hash: 'x', wellName: 'W' }, NOW).reason === 'no_request',
    'ordinary launches (no request params) stay ordinary');
  const bads = [
    // vc51.9B: '2' is now a SUPPORTED negotiated version — a v2 request
    // missing its period claims is malformed (no_period), never treated
    // as v1; genuinely unknown versions stay refused.
    [{ ...good, readRequestVersion: '2' }, 'no_period'],
    [{ ...good, readRequestVersion: '3' }, 'unsupported_version'],
    [{ ...good, readRequestId: 'short' }, 'bad_request_id'],
    [{ ...good, readRequestId: `${'A'.repeat(42)}=` }, 'bad_request_id'],
    [{ ...good, readRequestJobId: '' }, 'bad_job_id'],
    [{ ...good, hash: '' }, 'no_driver_hash'],
    [{ ...good, readRequestShift: '' }, 'no_shift'],
    [{ ...good, readRequestExpiresAt: 'garbage' }, 'bad_expiry'],
    [{ ...good, readRequestExpiresAt: new Date(NOW - 1000).toISOString() }, 'expired_at_arrival'],
  ];
  for (const [params, reason] of bads) {
    const r = parseWbtReadRequestParams(params, NOW);
    expect(!r.ctx && r.reason === reason, `malformed request discarded: ${reason}`);
  }
}

// ── Submit-time usability ───────────────────────────────────────────────────
{
  const ctx = parseWbtReadRequestParams(good, NOW).ctx;
  expect(isReadRequestContextUsable(ctx, NOW + 10 * 60_000), 'unexpired context usable at submit');
  expect(!isReadRequestContextUsable(ctx, NOW + 2 * 60 * 60_000), 'expired context discarded at submit');
  expect(!isReadRequestContextUsable(null, NOW), 'absent context = ordinary flow');
}

// ── Receipt fields — identity echo, no content claims ───────────────────────
{
  const ctx = parseWbtReadRequestParams(good, NOW).ctx;
  const fields = buildReadReceiptFields(ctx, '1754470000000', new Date(NOW + 12 * 60_000).toISOString());
  expect(fields.requestId.stringValue === RID && fields.jobDocId.stringValue === 'INV_123'
    && fields.jsaRecordId.stringValue === '1754470000000'
    && fields.completionType.stringValue === 'signed_submission'
    && fields.receiptVersion.integerValue === '1',
    'receipt echoes request identity + core submission id + signed_submission type');
  const keys = Object.keys(fields);
  expect(!keys.some((k) => /template|hazard|content|reviewed/i.test(k)),
    'no template/hazard-content claim rides on the receipt');
  let threw = false;
  try { buildReadReceiptFields(ctx, '', 'now'); } catch { threw = true; }
  expect(threw, 'a receipt without the core submission id is impossible');
}

// ── Source pins: both /start entries capture; capture is the only writer ────
{
  const start = readFileSync(join(root, 'app/start.tsx'), 'utf8');
  const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
  const svc = readFileSync(join(root, 'services/wbtReadRequest.ts'), 'utf8');
  expect(start.includes('captureReadRequestFromParams'),
    'cold-start /start route captures the request context');
  expect(layout.includes('captureReadRequestFromParams'),
    'warm-start deep-link path captures identically');
  expect(svc.includes('await clearReadRequestContext();'),
    'a /start without a valid request CLEARS stale context (explicit restart only)');
  // Durable-by-construction: the context lives in AsyncStorage under one
  // key — steps/ppe/signoff/background/rerender cannot lose it via route
  // params because none are threaded.
  expect(svc.includes("WBT_READ_REQUEST_KEY = '@jsa/wbtReadRequest'"),
    'context persists under one durable key across the whole flow');
}

// ── vc51.5 leakage audit — the nonce never reaches logs/telemetry ───────────
{
  const { redactRequestIds } = await import('../services/wbtReadRequest.ts');
  const id = 'Q'.repeat(20) + 'r'.repeat(20) + '-_s';
  const ret = `wellbuilt-tickets://jsa-return?requestId=${id}&version=1`;
  expect(!redactRequestIds(ret).includes(id) && redactRequestIds(ret).includes(`${id.slice(0, 8)}…`),
    'return-link URLs redact to an 8-char prefix');
  const so = readFileSync(join(root, 'app/signoff.tsx'), 'utf8');
  expect(so.includes('redactRequestIds(completeReturnScheme)'),
    'returnRouting diagnostics log the redacted scheme only');
  expect(!/returnTo: completeReturnScheme,/.test(so),
    'no diagnostic extra carries the raw return scheme');
}

console.log('wbtReadRequest tests passed');
