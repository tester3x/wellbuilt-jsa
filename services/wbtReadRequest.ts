/**
 * WB-T fresh-read REQUEST context (receipt contract v1, 8/6).
 *
 * WB-T's per-job Read gate launches jsaapp://start carrying a 256-bit
 * request identity. This module validates and persists that context so it
 * survives the ENTIRE flow — start route, home/SSO card, steps, PPE,
 * signoff, background/foreground, rerender — and signoff can write the
 * request-bound receipt AFTER the core jsas submission durably persists.
 *
 * Rules:
 *  - a malformed/expired request is NEVER silently converted into a
 *    shift-only completion claim: it is discarded with a log, the flow
 *    runs as an ordinary launch, WB-T finds no receipt and stays gated;
 *  - every NEW /start deep link is an explicit restart — it replaces (or,
 *    when carrying no valid request, clears) the stored context, so one
 *    request can never be satisfied by a different flow's parameters;
 *  - ordinary shift-level/manual usage (no WB-T request) is untouched.
 *
 * Pure helpers are dependency-free for the node test runner; only the
 * persistence wrappers import AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const WBT_READ_REQUEST_KEY = '@jsa/wbtReadRequest';
export const READ_RECEIPT_VERSION = 1;
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{43}$/;

export interface WbtReadRequestContext {
  receiptVersion: number;
  requestId: string;
  jobDocId: string;
  haulGroupId: string | null;
  companyId: string;
  driverHash: string;
  shiftId: string;
  operator: string;
  expiresAt: string;
  receivedAt: string;
}

export interface ParseResult {
  ctx: WbtReadRequestContext | null;
  reason: string;
}

const s = (v: unknown): string => (typeof v === 'string' ? v : Array.isArray(v) ? String(v[0] ?? '') : '');

/**
 * Validate the incoming deep-link params. `driverHash` rides on the
 * existing `hash` SSO param. Returns a context ONLY when every required
 * field is present and well-formed and the request is not already expired
 * at arrival — anything else yields {ctx:null, reason} and the launch is
 * treated as an ordinary (non-receipt) flow.
 */
export function parseWbtReadRequestParams(
  params: Record<string, unknown>,
  nowMs: number,
): ParseResult {
  const version = s(params.readRequestVersion);
  const requestId = s(params.readRequestId);
  if (!version && !requestId) return { ctx: null, reason: 'no_request' };
  if (version !== String(READ_RECEIPT_VERSION)) return { ctx: null, reason: 'unsupported_version' };
  if (!REQUEST_ID_RE.test(requestId)) return { ctx: null, reason: 'bad_request_id' };
  const jobDocId = s(params.readRequestJobId);
  if (!jobDocId || jobDocId.length > 120) return { ctx: null, reason: 'bad_job_id' };
  const driverHash = s(params.hash);
  if (!driverHash) return { ctx: null, reason: 'no_driver_hash' };
  const shiftId = s(params.readRequestShift);
  if (!shiftId) return { ctx: null, reason: 'no_shift' };
  const expiresAt = s(params.readRequestExpiresAt);
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return { ctx: null, reason: 'bad_expiry' };
  if (nowMs > exp) return { ctx: null, reason: 'expired_at_arrival' };
  return {
    ctx: {
      receiptVersion: READ_RECEIPT_VERSION,
      requestId,
      jobDocId,
      haulGroupId: s(params.readRequestGroupId) || null,
      companyId: s(params.readRequestCompany),
      driverHash,
      shiftId,
      operator: s(params.readRequestOperator),
      expiresAt,
      receivedAt: new Date(nowMs).toISOString(),
    },
    reason: 'ok',
  };
}

/** Usable at submit time: parses and is not expired. */
export function isReadRequestContextUsable(
  ctx: WbtReadRequestContext | null | undefined,
  nowMs: number,
): boolean {
  if (!ctx || !REQUEST_ID_RE.test(ctx.requestId || '')) return false;
  const exp = Date.parse(ctx.expiresAt || '');
  return !Number.isNaN(exp) && nowMs <= exp;
}

/**
 * The receipt fields WB-JSA writes AFTER the core jsas submission
 * persists. Identity is echoed from the stored request context (WB-T
 * verifies against ITS local copy — this doc is a durable claim, not the
 * trusted record). Deliberately absent: any assertion about template/
 * hazard content reviewed.
 */
export function buildReadReceiptFields(
  ctx: WbtReadRequestContext,
  jsaRecordId: string,
  completedAtIso: string,
): Record<string, { stringValue: string } | { integerValue: string }> {
  if (!jsaRecordId) throw new Error('receipt requires the core submission id');
  return {
    receiptVersion: { integerValue: String(READ_RECEIPT_VERSION) },
    requestId: { stringValue: ctx.requestId },
    jobDocId: { stringValue: ctx.jobDocId },
    ...(ctx.haulGroupId ? { haulGroupId: { stringValue: ctx.haulGroupId } } : {}),
    companyId: { stringValue: ctx.companyId },
    driverHash: { stringValue: ctx.driverHash },
    shiftId: { stringValue: ctx.shiftId },
    operator: { stringValue: ctx.operator },
    jsaRecordId: { stringValue: jsaRecordId },
    completedAt: { stringValue: completedAtIso },
    completionType: { stringValue: 'full_flow' },
  };
}

// ── Persistence (survives navigation/background/rerender) ───────────────────

export async function persistReadRequestContext(ctx: WbtReadRequestContext): Promise<void> {
  try { await AsyncStorage.setItem(WBT_READ_REQUEST_KEY, JSON.stringify(ctx)); } catch {}
}

export async function loadReadRequestContext(): Promise<WbtReadRequestContext | null> {
  try {
    const raw = await AsyncStorage.getItem(WBT_READ_REQUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WbtReadRequestContext;
    return REQUEST_ID_RE.test(parsed?.requestId || '') ? parsed : null;
  } catch { return null; }
}

export async function clearReadRequestContext(): Promise<void> {
  try { await AsyncStorage.removeItem(WBT_READ_REQUEST_KEY); } catch {}
}

/**
 * Handle a /start deep link's params — the ONLY writer of the stored
 * context. A valid request replaces whatever was stored (explicit
 * restart); an invalid/absent one CLEARS it (an old request must never be
 * satisfied by a different flow) and the launch proceeds as ordinary.
 */
export async function captureReadRequestFromParams(
  params: Record<string, unknown>,
  nowMs: number = Date.now(),
): Promise<ParseResult> {
  const result = parseWbtReadRequestParams(params, nowMs);
  if (result.ctx) {
    await persistReadRequestContext(result.ctx);
    console.log(`[JSA][wbtReadRequest] captured request ${result.ctx.requestId.slice(0, 8)}… for job ${result.ctx.jobDocId}`);
  } else {
    await clearReadRequestContext();
    if (result.reason !== 'no_request') {
      console.warn(`[JSA][wbtReadRequest] request rejected (${result.reason}) — ordinary flow, no receipt will exist`);
    }
  }
  return result;
}
