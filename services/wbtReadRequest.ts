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
// vc51.9B receipt contract v2 — canonical period binding. Negotiated by
// the REQUEST: a legacy v1 request receives v1 (old installed WB-T
// understands v1 only); a v2-capable request REQUIRES v2 with period
// proof and never downgrades.
export const READ_RECEIPT_VERSION_2 = 2;
export const REQUEST_ID_RE = /^[A-Za-z0-9_-]{43}$/;

export type RequestWorkPeriodMode = 'explicit_shift' | 'company_defined_period';

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
  /** v2 only — the canonical period the request binds to. */
  periodId?: string | null;
  workPeriodMode?: RequestWorkPeriodMode | null;
  requestContractVersion?: number | null;
}

/** Proven by the caller through requestPeriodBinding before any v2 write. */
export interface ReceiptV2Binding {
  submissionPeriodId: string;
  workPeriodMode: RequestWorkPeriodMode;
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
  const isV2 = version === String(READ_RECEIPT_VERSION_2);
  if (version !== String(READ_RECEIPT_VERSION) && !isV2) {
    return { ctx: null, reason: 'unsupported_version' };
  }
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
  // v2 requests must carry their canonical period claims — a v2 request
  // without them is malformed, never silently downgraded to v1.
  const periodId = s(params.readRequestPeriodId);
  const mode = s(params.readRequestMode);
  if (isV2) {
    if (!periodId || periodId.length > 120) return { ctx: null, reason: 'no_period' };
    if (mode !== 'explicit_shift' && mode !== 'company_defined_period') {
      return { ctx: null, reason: 'bad_mode' };
    }
  }
  return {
    ctx: {
      receiptVersion: isV2 ? READ_RECEIPT_VERSION_2 : READ_RECEIPT_VERSION,
      ...(isV2 ? {
        periodId,
        workPeriodMode: mode as RequestWorkPeriodMode,
        requestContractVersion: Number(s(params.readRequestContract) || '1'),
      } : {}),
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

/**
 * Redact full request ids from any text bound for logs/telemetry (vc51.5
 * leakage audit). The id is the read-receipt capability — diagnostics get
 * an 8-char prefix, never the whole nonce.
 */
export function redactRequestIds(text: string): string {
  return String(text).replace(
    /((?:readR|r)equestId=)([A-Za-z0-9_-]{43})/g,
    (_m, p, id) => `${p}${id.slice(0, 8)}…`,
  );
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
    // 'signed_submission' (vc51.4 honesty audit): the signature-gated
    // submission at the end of the guided flow. Step traversal is
    // UI-enforced on the primary path but NOT durably attested (an
    // unfinished-JSA resume lands on signoff directly), so the label
    // claims exactly what is proven — the signed submission.
    completionType: { stringValue: 'signed_submission' },
  };
}

/**
 * Receipt v2 (vc51.9B): the v1 identity claims PLUS the canonical
 * period proof — the request's claimed period, the INDEPENDENTLY
 * resolved submission period (proven equal by requestPeriodBinding
 * before this builder runs), and the mode needed to interpret them.
 * Same honesty scope: 'signed_submission', nothing more.
 */
export function buildReadReceiptFieldsV2(
  ctx: WbtReadRequestContext,
  jsaRecordId: string,
  completedAtIso: string,
  binding: ReceiptV2Binding,
): Record<string, { stringValue: string } | { integerValue: string }> {
  if (!jsaRecordId) throw new Error('receipt requires the core submission id');
  if (ctx.receiptVersion !== READ_RECEIPT_VERSION_2 || !ctx.periodId) {
    throw new Error('v2 receipt requires a v2 request context');
  }
  if (binding.submissionPeriodId !== ctx.periodId) {
    throw new Error('v2 receipt requires proven request/submission period equality');
  }
  return {
    receiptVersion: { integerValue: String(READ_RECEIPT_VERSION_2) },
    requestId: { stringValue: ctx.requestId },
    jobDocId: { stringValue: ctx.jobDocId },
    ...(ctx.haulGroupId ? { haulGroupId: { stringValue: ctx.haulGroupId } } : {}),
    companyId: { stringValue: ctx.companyId },
    driverHash: { stringValue: ctx.driverHash },
    operator: { stringValue: ctx.operator },
    requestPeriodId: { stringValue: ctx.periodId },
    submissionPeriodId: { stringValue: binding.submissionPeriodId },
    workPeriodMode: { stringValue: binding.workPeriodMode },
    jsaRecordId: { stringValue: jsaRecordId },
    completedAt: { stringValue: completedAtIso },
    completionType: { stringValue: 'signed_submission' },
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

// ── Durable receipt write (called ONLY after the core jsas write) ───────────

const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents';
const FIRESTORE_API_KEY = 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI';
const RECEIPT_TIMEOUT_MS = 10_000;

/**
 * Write jsa_read_receipts/{requestId}. MUST be called only after the core
 * jsas/{jsaRecordId} persistence succeeded — the receipt is a claim that
 * the submission durably exists. Idempotent: an existing receipt for this
 * requestId counts as success (retries and the immutable-rules model both
 * land here), so no duplicate success receipts are possible.
 */
export async function writeReadReceipt(
  ctx: WbtReadRequestContext,
  jsaRecordId: string,
  v2Binding?: ReceiptV2Binding,
): Promise<boolean> {
  try {
    if (!REQUEST_ID_RE.test(ctx?.requestId || '') || !jsaRecordId) return false;
    // Downgrade resistance: a v2 request without a PROVEN binding never
    // produces any receipt — v1 fields are not an acceptable fallback.
    if (ctx.receiptVersion === READ_RECEIPT_VERSION_2 && !v2Binding) {
      console.warn('[JSA][wbtReadRequest] v2 request without proven period binding — no receipt');
      return false;
    }
    const url = `${FIRESTORE_BASE}/jsa_read_receipts/${ctx.requestId}?key=${FIRESTORE_API_KEY}`;
    // GET-first idempotence: a prior successful attempt already wrote the
    // (immutable) receipt.
    try {
      const c0 = new AbortController();
      const t0 = setTimeout(() => c0.abort(), RECEIPT_TIMEOUT_MS);
      const g = await fetch(url, { signal: c0.signal });
      clearTimeout(t0);
      if (g.ok) {
        const doc = await g.json();
        if (doc?.fields?.requestId?.stringValue === ctx.requestId) {
          console.log('[JSA][wbtReadRequest] receipt already exists — idempotent success');
          return true;
        }
      }
    } catch {}
    const fields = ctx.receiptVersion === READ_RECEIPT_VERSION_2 && v2Binding
      ? buildReadReceiptFieldsV2(ctx, jsaRecordId, new Date().toISOString(), v2Binding)
      : buildReadReceiptFields(ctx, jsaRecordId, new Date().toISOString());
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), RECEIPT_TIMEOUT_MS);
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: c1.signal,
    });
    clearTimeout(t1);
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[JSA][wbtReadRequest] receipt write failed: HTTP ${resp.status} ${body.slice(0, 160)}`);
      return false;
    }
    console.log(`[JSA][wbtReadRequest] receipt written for request ${ctx.requestId.slice(0, 8)}… (jsaRecordId=${jsaRecordId})`);
    return true;
  } catch (err) {
    console.warn('[JSA][wbtReadRequest] receipt write error:', (err as any)?.message || err);
    return false;
  }
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
