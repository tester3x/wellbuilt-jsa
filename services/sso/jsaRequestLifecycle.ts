/**
 * Authoritative get/complete lifecycle for a governed WB-T request.
 *
 * Launch hints, cached shifts, history, and the device date never select
 * the workflow. jsaGetReadRequest is the sole selector. The detailed JSA
 * record is saved first; jsaCompleteReadRequest is authored only after.
 *
 * Pure and node-testable. No I/O, no names in strings bound for logs.
 */

export function isJsaRequestId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
}

export type JsaReturnStatus = 'read' | 'acknowledged' | 'declined' | 'error';

export interface JsaLaunchHint {
  jobRef?: string;
  groupRef?: string;
  wellName?: string;
  jobType?: string;
  requestId?: string;
  returnTo?: string;
}

export const JSA_INTENTS = Object.freeze([
  'read',
  'acknowledge',
  'read_and_acknowledge',
] as const);
export type JsaPolicyIntent = (typeof JSA_INTENTS)[number];

export const JSA_ACTIONS = Object.freeze([
  'read_completed',
  'acknowledged',
  'read_and_acknowledged',
] as const);
export type JsaCompletionAction = (typeof JSA_ACTIONS)[number];

export function isPolicyIntent(v: unknown): v is JsaPolicyIntent {
  return typeof v === 'string' && (JSA_INTENTS as readonly string[]).includes(v);
}

export function isCompletionAction(v: unknown): v is JsaCompletionAction {
  return typeof v === 'string' && (JSA_ACTIONS as readonly string[]).includes(v);
}

export type JsaRequestState = 'pending' | 'completed';

export interface JsaRequestContextView {
  requestId: string;
  state: JsaRequestState;
  intent: JsaPolicyIntent;
  jobRef: string;
  groupRef: string | null;
  expiresAtMs?: number;
  action?: JsaCompletionAction;
  wellName?: string;
  jobType?: string;
}

export const JSA_WELL_NAME_MAX = 120;
export const JSA_JOB_TYPE_MAX = 64;

function boundedDisplay(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > max) return null;
  return t;
}

export interface JsaCompleteResult {
  requestId: string;
  action: JsaCompletionAction;
  reused: boolean;
}

export type JsaUiKind = 'full_read_and_signoff' | 'acknowledge_only';

export const FULL_READ_STAGES = Object.freeze(['steps', 'ppe', 'signoff'] as const);
export const ACK_ONLY_STAGES = Object.freeze(['acknowledge'] as const);

/**
 * Exact UI → terminal-action mapping.
 *
 * The existing first-read flow is steps → PPE → signoff signature. That
 * last interaction is an acknowledgment, so a full-read UI always submits
 * `read_and_acknowledged` (monotone: this also satisfies a registered
 * `read` intent). A dedicated acknowledgment screen submits `acknowledged`.
 * There is no current UI that ends without acknowledgment, so the client
 * never authors `read_completed`.
 */
export const UI_TERMINAL_MAP = Object.freeze({
  read: {
    ui: 'full_read_and_signoff' as const,
    stages: FULL_READ_STAGES,
    terminalAction: 'read_and_acknowledged' as const,
    interaction:
      'steps → ppe → signoff signature/submit (inherent acknowledgment) → read_and_acknowledged',
  },
  acknowledge: {
    ui: 'acknowledge_only' as const,
    stages: ACK_ONLY_STAGES,
    terminalAction: 'acknowledged' as const,
    interaction:
      'acknowledge screen + legalName-defaulted signature/submit → acknowledged',
  },
  read_and_acknowledge: {
    ui: 'full_read_and_signoff' as const,
    stages: FULL_READ_STAGES,
    terminalAction: 'read_and_acknowledged' as const,
    interaction:
      'steps → ppe → signoff signature/submit (read + acknowledgment) → read_and_acknowledged',
  },
});

export function selectUiForIntent(intent: JsaPolicyIntent) {
  return UI_TERMINAL_MAP[intent];
}

export function terminalActionForIntent(intent: JsaPolicyIntent): JsaCompletionAction {
  return UI_TERMINAL_MAP[intent].terminalAction;
}

const FORBIDDEN_CONTEXT_KEYS = Object.freeze([
  'driverId', 'companyId', 'shiftId', 'periodId', 'originLocalDate',
  'name', 'displayName', 'legalName', 'driverHash', 'hash', 'passcode',
  'customToken', 'code', 'codeVerifier', 'verifier', 'uid',
]);

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export type ParseDecision<T> =
  | { ok: true; value: T }
  | { ok: false; field: string };

export function parseGetContextView(raw: unknown): ParseDecision<JsaRequestContextView> {
  const o = rec(raw);
  if (!o) return { ok: false, field: '<root>' };
  if (Object.keys(o).some((k) => FORBIDDEN_CONTEXT_KEYS.includes(k))) {
    return { ok: false, field: '<forbidden>' };
  }
  if (!isJsaRequestId(o.requestId)) return { ok: false, field: 'requestId' };
  if (o.state !== 'pending' && o.state !== 'completed') return { ok: false, field: 'state' };
  if (!isPolicyIntent(o.intent)) return { ok: false, field: 'intent' };
  if (typeof o.jobRef !== 'string' || !o.jobRef || o.jobRef.length > 128) {
    return { ok: false, field: 'jobRef' };
  }
  if (o.groupRef != null && o.groupRef !== '') {
    if (typeof o.groupRef !== 'string' || o.groupRef.length > 128) {
      return { ok: false, field: 'groupRef' };
    }
  }
  const view: JsaRequestContextView = {
    requestId: o.requestId,
    state: o.state,
    intent: o.intent,
    jobRef: o.jobRef,
    groupRef: o.groupRef ? String(o.groupRef) : null,
  };
  if (o.state === 'pending') {
    if (o.expiresAtMs !== undefined) {
      if (typeof o.expiresAtMs !== 'number' || !Number.isFinite(o.expiresAtMs)) {
        return { ok: false, field: 'expiresAtMs' };
      }
      view.expiresAtMs = o.expiresAtMs;
    }
    if (o.wellName !== undefined) {
      const wellName = boundedDisplay(o.wellName, JSA_WELL_NAME_MAX);
      if (!wellName) return { ok: false, field: 'wellName' };
      view.wellName = wellName;
    }
    if (o.jobType !== undefined) {
      const jobType = boundedDisplay(o.jobType, JSA_JOB_TYPE_MAX);
      if (!jobType) return { ok: false, field: 'jobType' };
      view.jobType = jobType;
    }
  }
  if (o.state === 'completed') {
    if (!isCompletionAction(o.action)) return { ok: false, field: 'action' };
    view.action = o.action;
  }
  return { ok: true, value: view };
}

export function parseCompleteResult(raw: unknown): ParseDecision<JsaCompleteResult> {
  const o = rec(raw);
  if (!o) return { ok: false, field: '<root>' };
  if (Object.keys(o).some((k) => FORBIDDEN_CONTEXT_KEYS.includes(k))) {
    return { ok: false, field: '<forbidden>' };
  }
  if (!isJsaRequestId(o.requestId)) return { ok: false, field: 'requestId' };
  if (!isCompletionAction(o.action)) return { ok: false, field: 'action' };
  if (typeof o.reused !== 'boolean') return { ok: false, field: 'reused' };
  return {
    ok: true,
    value: { requestId: o.requestId, action: o.action, reused: o.reused },
  };
}

/** Pending UI may use only these server fields — never launch identity. */
export function pendingDisplayFields(view: JsaRequestContextView): {
  intent: JsaPolicyIntent;
  jobRef: string;
  groupRef: string | null;
  expiresAtMs?: number;
  wellName?: string;
  jobType?: string;
} {
  return {
    intent: view.intent,
    jobRef: view.jobRef,
    groupRef: view.groupRef,
    ...(view.expiresAtMs !== undefined ? { expiresAtMs: view.expiresAtMs } : {}),
    ...(view.wellName ? { wellName: view.wellName } : {}),
    ...(view.jobType ? { jobType: view.jobType } : {}),
  };
}

export interface IgnoredLaunchHints {
  launchJobRef?: string;
  launchGroupRef?: string;
  wellName?: string;
  jobType?: string;
  ignored: true;
}

/**
 * Server jobRef/groupRef/intent win. Launch wellName/jobType and a
 * conflicting launch jobRef are discarded, never rendered as authority.
 */
export function ignoreLaunchHints(
  launch: JsaLaunchHint | null,
  view: JsaRequestContextView,
): { used: ReturnType<typeof pendingDisplayFields>; discarded: IgnoredLaunchHints } {
  return {
    used: pendingDisplayFields(view),
    discarded: {
      ...(launch?.jobRef !== undefined ? { launchJobRef: launch.jobRef } : {}),
      ...(launch?.groupRef !== undefined ? { launchGroupRef: launch.groupRef } : {}),
      ...(launch?.wellName !== undefined ? { wellName: launch.wellName } : {}),
      ...(launch?.jobType !== undefined ? { jobType: launch.jobType } : {}),
      ignored: true,
    },
  };
}

export type JsaRefusal =
  | 'unauthenticated'
  | 'wrong_audience'
  | 'not_a_driver'
  | 'binding_mismatch'
  | 'not_found'
  | 'expired'
  | 'jsa_disabled'
  | 'active_shift_required'
  | 'authority_unverifiable'
  | 'intent_not_permitted'
  | 'action_not_permitted'
  | 'conflict'
  | 'malformed'
  | 'network'
  | 'local_save_failed'
  | 'complete_failed';

export const FAIL_CLOSED_COPY: Record<JsaRefusal, string> = Object.freeze({
  unauthenticated:
    'Could not sign in to WellBuilt JSA. Return to WellBuilt Tickets and launch again.',
  wrong_audience:
    'This session cannot open a Tickets JSA request. Return to WellBuilt Tickets and launch again.',
  not_a_driver:
    'This session cannot open a Tickets JSA request. Return to WellBuilt Tickets and launch again.',
  binding_mismatch:
    'This JSA request does not match the current shift. Return to WellBuilt Tickets and launch again.',
  not_found:
    'This JSA request is no longer available. Return to WellBuilt Tickets and launch again.',
  expired:
    'This JSA request has expired. Return to WellBuilt Tickets and launch again.',
  jsa_disabled:
    'JSA is not available for this shift. Return to WellBuilt Tickets and launch again.',
  active_shift_required:
    'An active WellBuilt shift is required. Return to WellBuilt Tickets and launch again.',
  authority_unverifiable:
    'Current WellBuilt shift could not be verified. Return to WellBuilt Tickets and launch again.',
  intent_not_permitted:
    'This JSA action is not available now. Return to WellBuilt Tickets and launch again.',
  action_not_permitted:
    'This JSA action is not available now. Return to WellBuilt Tickets and launch again.',
  conflict:
    'This JSA request was already completed differently. Return to WellBuilt Tickets and launch again.',
  malformed:
    'This JSA request is not valid. Return to WellBuilt Tickets and launch again.',
  network:
    'Could not reach WellBuilt services. Return to WellBuilt Tickets and try again.',
  local_save_failed:
    'Your JSA could not be saved on this device. Stay here and try again. Do not return to Tickets yet.',
  complete_failed:
    'Your JSA is saved on this device, but WellBuilt could not record completion. Stay here and tap Retry. Do not return to Tickets yet.',
});

export function failClosedCopy(refusal: JsaRefusal): string {
  return FAIL_CLOSED_COPY[refusal];
}

export function returnStatusForAction(action: JsaCompletionAction): JsaReturnStatus {
  if (action === 'read_completed') return 'read';
  return 'acknowledged';
}

export function mayReturnAfterComplete(result: JsaCompleteResult | null): boolean {
  return !!result && isCompletionAction(result.action);
}

export type RecoveryPhase =
  | 'before_context_read'
  | 'in_ui'
  | 'local_saved_pending_complete'
  | 'completed_pending_return'
  | 'returned';

export interface RecoverySnapshot {
  phase: RecoveryPhase;
  launch: JsaLaunchHint | null;
  context: JsaRequestContextView | null;
  pendingComplete: { requestId: string; action: JsaCompletionAction } | null;
}

export type RecoveryDecision =
  | { next: 'reread' }
  | { next: 'resume_ui'; ui: JsaUiKind; stages: readonly string[]; terminalAction: JsaCompletionAction }
  | { next: 'retry_complete'; requestId: string; action: JsaCompletionAction }
  | { next: 'return_completed'; action: JsaCompletionAction; status: JsaReturnStatus }
  | { next: 'fail_closed'; refusal: JsaRefusal; copy: string };

export function decideRecovery(snap: RecoverySnapshot): RecoveryDecision {
  if (!snap.launch) {
    return { next: 'fail_closed', refusal: 'malformed', copy: failClosedCopy('malformed') };
  }
  if (snap.phase === 'before_context_read' || !snap.context) {
    return { next: 'reread' };
  }
  if (snap.context.requestId !== snap.launch.requestId) {
    return { next: 'fail_closed', refusal: 'not_found', copy: failClosedCopy('not_found') };
  }
  if (snap.context.state === 'completed' && snap.context.action) {
    if (
      snap.pendingComplete
      && snap.pendingComplete.action !== snap.context.action
    ) {
      return { next: 'fail_closed', refusal: 'conflict', copy: failClosedCopy('conflict') };
    }
    return {
      next: 'return_completed',
      action: snap.context.action,
      status: returnStatusForAction(snap.context.action),
    };
  }
  if (snap.phase === 'local_saved_pending_complete' && snap.pendingComplete) {
    if (snap.pendingComplete.requestId !== snap.context.requestId) {
      return { next: 'fail_closed', refusal: 'not_found', copy: failClosedCopy('not_found') };
    }
    return {
      next: 'retry_complete',
      requestId: snap.pendingComplete.requestId,
      action: snap.pendingComplete.action,
    };
  }
  const selected = selectUiForIntent(snap.context.intent);
  return {
    next: 'resume_ui',
    ui: selected.ui,
    stages: selected.stages,
    terminalAction: selected.terminalAction,
  };
}

export function decideAfterGet(view: JsaRequestContextView): RecoveryDecision {
  if (view.state === 'completed' && view.action) {
    return {
      next: 'return_completed',
      action: view.action,
      status: returnStatusForAction(view.action),
    };
  }
  if (
    view.state === 'pending'
    && (view.intent === 'read' || view.intent === 'read_and_acknowledge')
    && !view.wellName
  ) {
    return { next: 'fail_closed', refusal: 'not_found', copy: failClosedCopy('not_found') };
  }
  const selected = selectUiForIntent(view.intent);
  return {
    next: 'resume_ui',
    ui: selected.ui,
    stages: selected.stages,
    terminalAction: selected.terminalAction,
  };
}

/**
 * Mid-flow re-get. Tightening (server now refuses) fail-closes.
 * Loosening still uses the registered intent from the successful get.
 * A completed read-back returns without repeating stages.
 */
export function decideMidFlowGet(input: {
  previous: JsaRequestContextView;
  next: { ok: true; view: JsaRequestContextView } | { ok: false; refusal: JsaRefusal };
}): RecoveryDecision {
  if (!input.next.ok) {
    return {
      next: 'fail_closed',
      refusal: input.next.refusal,
      copy: failClosedCopy(input.next.refusal),
    };
  }
  return decideAfterGet(input.next.view);
}

export function mayCompleteWithDifferentAction(
  completedAction: JsaCompletionAction,
  nextAction: JsaCompletionAction,
): boolean {
  return completedAction === nextAction;
}

export function historyMustNotSatisfyGovernedRequest(input: {
  governedPending: boolean;
  viewingHistorical: boolean;
}): boolean {
  return !(input.governedPending && input.viewingHistorical);
}

export function mayShowLegacyLoginDuringGoverned(governed: boolean): false {
  void governed;
  return false;
}

export type CallableRefusal = JsaRefusal;

/** Exact Firebase callable code. Do not blob-match this classification. */
export const FUNCTIONS_UNAUTHENTICATED_CODE = 'functions/unauthenticated';

export function exactCallableErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export function classifyCallableError(err: unknown): JsaRefusal {
  if (exactCallableErrorCode(err) === FUNCTIONS_UNAUTHENTICATED_CODE) {
    return 'unauthenticated';
  }
  const e = err as {
    code?: string;
    message?: string;
    details?: unknown;
  } | null;
  const code = String(e?.code || '');
  const details = rec(e?.details);
  const refusal = typeof details?.refusal === 'string' ? details.refusal : '';
  const message = String(e?.message || '');
  const blob = `${code} ${refusal} ${message}`.toLowerCase();
  if (blob.includes('wrong_audience') || blob.includes('not_a_driver')) {
    return blob.includes('not_a_driver') ? 'not_a_driver' : 'wrong_audience';
  }
  if (blob.includes('binding_mismatch')) return 'binding_mismatch';
  if (blob.includes('expired')) return 'expired';
  if (blob.includes('not_found') || blob.includes('unregistered')) return 'not_found';
  if (blob.includes('jsa_disabled')) return 'jsa_disabled';
  if (blob.includes('active_shift_required')) return 'active_shift_required';
  if (blob.includes('authority_unverifiable')) return 'authority_unverifiable';
  if (blob.includes('intent_not_permitted')) return 'intent_not_permitted';
  if (blob.includes('action_not_permitted')) return 'action_not_permitted';
  if (blob.includes('conflict')) return 'conflict';
  if (blob.includes('invalid-argument') || blob.includes('malformed')) return 'malformed';
  if (
    blob.includes('network')
    || blob.includes('unavailable')
    || blob.includes('deadline')
    || blob.includes('failed to fetch')
  ) {
    return 'network';
  }
  return 'complete_failed';
}

export function classifyGetError(err: unknown): JsaRefusal {
  const r = classifyCallableError(err);
  return r === 'complete_failed' ? 'network' : r;
}

// ── Cold-start-tolerant protected get (vc10) ────────────────────────────────
// Field 8/13: the jsa callable fleet scales from zero and took 24–32s to
// pass Cloud Run readiness while the client abandoned the get at 15s.
// ONE bounded attempt whose bound exceeds the worst captured readiness
// time. No automatic second attempt — the connecting surface stays up for
// the whole bounded operation, then terminal fail-closed.

/** The single protected-get bound — above the 32s worst captured cold start. */
export const JSA_GET_TIMEOUT_MS = 45_000;

export type JsaGetLogCategory =
  | 'ok'
  | 'timeout'
  | 'unavailable'
  | 'unauthenticated'
  | 'binding'
  | 'permission'
  | 'refusal';

/**
 * Sanitized outcome category for diagnostics. Reason codes only — never
 * URLs, tokens, codes, signatures, identity payloads, or request bodies.
 */
export function getOutcomeLogCategory(refusal: JsaRefusal | null, err?: unknown): JsaGetLogCategory {
  if (refusal === null) return 'ok';
  if (refusal === 'network') {
    const code = String((err as { code?: unknown } | null)?.code || '').toLowerCase();
    const message = String((err as { message?: unknown } | null)?.message || '').toLowerCase();
    return code.includes('deadline') || message.includes('deadline') ? 'timeout' : 'unavailable';
  }
  if (refusal === 'unauthenticated') return 'unauthenticated';
  if (refusal === 'binding_mismatch' || refusal === 'active_shift_required'
    || refusal === 'authority_unverifiable') {
    return 'binding';
  }
  if (refusal === 'wrong_audience' || refusal === 'not_a_driver'
    || refusal === 'intent_not_permitted' || refusal === 'action_not_permitted') {
    return 'permission';
  }
  return 'refusal';
}

export interface PendingCompleteRecord {
  requestId: string;
  action: JsaCompletionAction;
  localRecordId: string;
  savedAtMs: number;
}

export function parsePendingComplete(raw: unknown): PendingCompleteRecord | null {
  const o = rec(raw);
  if (!o) return null;
  if (!isJsaRequestId(o.requestId) || !isCompletionAction(o.action)) return null;
  if (typeof o.localRecordId !== 'string' || !o.localRecordId) return null;
  if (typeof o.savedAtMs !== 'number' || !Number.isFinite(o.savedAtMs)) return null;
  return {
    requestId: o.requestId,
    action: o.action,
    localRecordId: o.localRecordId,
    savedAtMs: o.savedAtMs,
  };
}

/** Opaque link only — never copy launch identity/authority onto the save. */
export function governedRecordLink(requestId: string): { governedRequestRef: string } {
  return { governedRequestRef: requestId };
}

export const GOVERNED_REQUEST_CONTEXT_KEY = '@jsa/governedRequestContext';
export const GOVERNED_PENDING_COMPLETE_KEY = '@jsa/pendingComplete';
export const GOVERNED_UI_STAGE_KEY = '@jsa/governedUiStage';
export const GOVERNED_LAUNCH_OWNERSHIP_KEY = '@jsa/governedLaunchOwnership';

export function persistOrderIsLocalThenComplete(): 'local_save_then_complete' {
  return 'local_save_then_complete';
}

export interface LaunchOwnership {
  request: JsaLaunchHint & { requestId: string; returnTo?: string };
  receivedAtMs: number;
}

export function takeOwnedLaunch(
  current: LaunchOwnership | null,
  next: LaunchOwnership['request'],
  nowMs: number,
): { action: 'own' | 'replace' | 'duplicate'; ownership: LaunchOwnership } {
  if (!current) return { action: 'own', ownership: { request: next, receivedAtMs: nowMs } };
  if (current.request.requestId === next.requestId) {
    return { action: 'duplicate', ownership: current };
  }
  return { action: 'replace', ownership: { request: next, receivedAtMs: nowMs } };
}

export interface GovernedEntryDeps {
  nowMs(): number;
  loadOwnership(): Promise<LaunchOwnership | null>;
  saveOwnership(own: LaunchOwnership): Promise<void>;
  saveLaunch(req: LaunchOwnership['request']): Promise<void>;
  loadLaunch(): Promise<(JsaLaunchHint & { requestId: string }) | null>;
  loadSession(): Promise<unknown | null>;
  /**
   * Optional. When a protected get is exactly `functions/unauthenticated`,
   * run one-shot recovery. Missing hook → fail-closed (no new complete recovery).
   */
  beginUnauthenticatedRecovery?(session: unknown): Promise<'recover' | 'join' | 'fail_closed'>;
  consumeRecoveryLatch?(session: unknown): Promise<void>;
  markTerminalFailure?(requestId: string): Promise<void>;
  clearTerminalFailure?(requestId: string): Promise<void>;
  awaitAuthReady?(): Promise<void>;
  /**
   * SYNCHRONOUS generation guard from the start owner — cheap early-outs
   * only. An obsolete run may finish its already-started network read; it
   * may not persist, clear, mark, or steer afterward.
   */
  stillOwned?(): boolean;
  /**
   * Generation-conditional TRANSACTION from the start owner
   * (commitIfOwned bound to this run): the ownership recheck and the
   * awaited durable effect run inside the same serialized boundary as
   * adoption, so an adoption can neither interleave with a pending owned
   * write nor be overwritten by one settling late. Every durable side
   * effect below goes through it when present.
   */
  commitOwnedEffect?(effect: () => Promise<void>): Promise<{ applied: boolean }>;
  get(requestId: string): Promise<
    { ok: true; view: JsaRequestContextView } | { ok: false; refusal: JsaRefusal }
  >;
  complete(requestId: string, action: JsaCompletionAction): Promise<
    { ok: true; result: JsaCompleteResult } | { ok: false; refusal: JsaRefusal }
  >;
  saveContext(view: JsaRequestContextView): Promise<void>;
  loadContext(): Promise<JsaRequestContextView | null>;
  savePending(rec: PendingCompleteRecord): Promise<void>;
  loadPending(): Promise<PendingCompleteRecord | null>;
  clearPending(): Promise<void>;
}

export type EntryDecision =
  | { kind: 'need_auth'; launch: JsaLaunchHint & { requestId: string } }
  | { kind: 'fail_closed'; refusal: JsaRefusal; copy: string }
  | ({ kind: 'ready' } & RecoveryDecision & { view?: JsaRequestContextView });

export async function ownGovernedLaunch(
  deps: Pick<GovernedEntryDeps, 'nowMs' | 'loadOwnership' | 'saveOwnership' | 'saveLaunch'>,
  next: LaunchOwnership['request'],
): Promise<LaunchOwnership> {
  const current = await deps.loadOwnership();
  const taken = takeOwnedLaunch(current, next, deps.nowMs());
  await deps.saveOwnership(taken.ownership);
  await deps.saveLaunch(taken.ownership.request);
  return taken.ownership;
}

export async function obtainAuthoritativeContext(deps: GovernedEntryDeps): Promise<EntryDecision> {
  if (deps.awaitAuthReady) await deps.awaitAuthReady();
  const launch = await deps.loadLaunch();
  if (!launch) {
    return { kind: 'fail_closed', refusal: 'malformed', copy: failClosedCopy('malformed') };
  }
  const session = await deps.loadSession();
  if (!session) return { kind: 'need_auth', launch };
  const mayEffect = () => !deps.stillOwned || deps.stillOwned();
  // Durable effects go through the owner's serialized transaction: the
  // ownership recheck and the awaited write share the adoption queue, so
  // a late write can never settle over a successor's state. Absent (paths
  // not run under the start owner), effects apply directly.
  const commit: NonNullable<GovernedEntryDeps['commitOwnedEffect']> =
    deps.commitOwnedEffect
    ?? (async (effect) => {
      if (!mayEffect()) return { applied: false };
      await effect();
      return { applied: true };
    });
  const got = await deps.get(launch.requestId);
  if (!mayEffect()) {
    // Superseded while the get was in flight: persist nothing, mark
    // nothing — the successor's run owns every durable effect now.
    return { kind: 'fail_closed', refusal: 'not_found', copy: failClosedCopy('not_found') };
  }
  if (!got.ok) {
    if (got.refusal === 'unauthenticated' && deps.beginUnauthenticatedRecovery) {
      // Recovery setup mutates the latch/attempt — owner-transacted.
      let outcome: 'recover' | 'join' | 'fail_closed' | null = null;
      const began = await commit(async () => {
        outcome = await deps.beginUnauthenticatedRecovery!(session);
      });
      if (began.applied && (outcome === 'recover' || outcome === 'join')) {
        return { kind: 'need_auth', launch };
      }
      if (!began.applied) {
        return { kind: 'fail_closed', refusal: 'not_found', copy: failClosedCopy('not_found') };
      }
    }
    if (deps.markTerminalFailure) {
      await commit(() => deps.markTerminalFailure!(launch.requestId));
    }
    return { kind: 'fail_closed', refusal: got.refusal, copy: failClosedCopy(got.refusal) };
  }
  ignoreLaunchHints(launch, got.view);
  // ONE success transaction: context persistence + matching latch
  // consumption + matching terminal clear — another launch cannot adopt
  // between these related effects.
  const committed = await commit(async () => {
    await deps.saveContext(got.view);
    if (deps.consumeRecoveryLatch) await deps.consumeRecoveryLatch(session);
    if (deps.clearTerminalFailure) await deps.clearTerminalFailure(launch.requestId);
  });
  if (!committed.applied) {
    return { kind: 'fail_closed', refusal: 'not_found', copy: failClosedCopy('not_found') };
  }
  const decided = decideAfterGet(got.view);
  return { kind: 'ready', ...decided, view: got.view };
}

export async function recoverGovernedRequest(deps: GovernedEntryDeps): Promise<EntryDecision> {
  const launch = await deps.loadLaunch();
  const context = await deps.loadContext();
  const pending = await deps.loadPending();
  let phase: RecoveryPhase = 'before_context_read';
  if (context?.state === 'completed') phase = 'completed_pending_return';
  else if (pending) phase = 'local_saved_pending_complete';
  else if (context) phase = 'in_ui';
  const decided = decideRecovery({
    phase,
    launch,
    context,
    pendingComplete: pending,
  });
  if (decided.next === 'reread') return obtainAuthoritativeContext(deps);
  if (decided.next === 'fail_closed') {
    return { kind: 'fail_closed', refusal: decided.refusal, copy: decided.copy };
  }
  return { kind: 'ready', ...decided, view: context || undefined };
}

export async function completeAfterLocalSave(
  deps: GovernedEntryDeps,
  input: { requestId: string; action: JsaCompletionAction; localRecordId: string; nowMs: number },
): Promise<
  | { kind: 'completed'; reused: boolean; action: JsaCompletionAction }
  | { kind: 'pending_retry'; refusal: JsaRefusal; copy: string }
  | { kind: 'fail_closed'; refusal: JsaRefusal; copy: string }
> {
  void persistOrderIsLocalThenComplete();
  const context = await deps.loadContext();
  if (context?.state === 'completed' && context.action) {
    if (!mayCompleteWithDifferentAction(context.action, input.action)) {
      return { kind: 'fail_closed', refusal: 'conflict', copy: failClosedCopy('conflict') };
    }
    return { kind: 'completed', reused: true, action: context.action };
  }
  await deps.savePending({
    requestId: input.requestId,
    action: input.action,
    localRecordId: input.localRecordId,
    savedAtMs: input.nowMs,
  });
  const done = await deps.complete(input.requestId, input.action);
  if (!done.ok) {
    return { kind: 'pending_retry', refusal: done.refusal, copy: failClosedCopy(done.refusal) };
  }
  await deps.saveContext({
    requestId: done.result.requestId,
    state: 'completed',
    intent: context?.intent || 'read_and_acknowledge',
    jobRef: context?.jobRef || 'unknown',
    groupRef: context?.groupRef ?? null,
    action: done.result.action,
  });
  await deps.clearPending();
  return { kind: 'completed', reused: done.result.reused, action: done.result.action };
}

export function decideReturnAllowed(input: {
  launch: JsaLaunchHint | null;
  completion: JsaCompleteResult | null;
}): { open: true; status: JsaReturnStatus } | { stay: true; reason: string } {
  if (!input.launch) return { stay: true, reason: 'no_launch' };
  if (input.launch.returnTo && input.launch.returnTo !== 'wbt') {
    return { stay: true, reason: 'no_return' };
  }
  if (!mayReturnAfterComplete(input.completion)) {
    return { stay: true, reason: 'not_completed' };
  }
  return { open: true, status: returnStatusForAction(input.completion!.action) };
}
