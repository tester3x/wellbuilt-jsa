/**
 * Map a local governed JSA record onto the backend v1 authored snapshot.
 *
 * Pure. No I/O. Printed name and drawn PNG are different fields.
 * Local company/driver/job/shift/well values are never copied into the
 * payload — the server derives those from the governed request.
 */
/** Import-free so node --experimental-strip-types tests can load this leaf. */

function isJsaRequestId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
}

const JSA_ACTIONS = ['read_completed', 'acknowledged', 'read_and_acknowledged'] as const;
export type JsaCompletionAction = (typeof JSA_ACTIONS)[number];

function isCompletionAction(v: unknown): v is JsaCompletionAction {
  return typeof v === 'string' && (JSA_ACTIONS as readonly string[]).includes(v);
}

export const JSA_ARTIFACT_SNAPSHOT_VERSION = 1;
export const JSA_SIGNATURE_MAX_BYTES = 128 * 1024;
export const JSA_SIGNATURE_MIME = 'image/png';
export const JSA_SNAPSHOT_MAX_JSON_CHARS = 180_000;

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const FORM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const AUTHORITY_KEYS = Object.freeze([
  'uid', 'driverId', 'companyId', 'driverHash', 'passcode', 'hash',
  'shiftId', 'periodId', 'originLocalDate', 'shiftState',
  'name', 'displayName', 'legalName', 'driverLegalName', 'driverName',
  'customToken', 'code', 'codeVerifier', 'verifier',
  'wellName', 'jobType', 'jobRef', 'groupRef', 'intent', 'action',
  'completedAtMs', 'artifactWrittenAtMs', 'schemaVersion',
  'jobActivityName', 'task', 'operator', 'operatorSlug', 'scope',
]);

const LIMITS = {
  notes: 4000,
  pusher: 120,
  otherInfo: 2000,
  printedName: 120,
  truckNumber: 32,
  mapKeys: 40,
  locations: 24,
  locationItem: 120,
  ppeOther: 16,
  ppeOtherItem: 80,
};

export type ArtifactAdaptRefusal =
  | 'malformed'
  | 'missing_png'
  | 'invalid_png'
  | 'oversized'
  | 'missing_printed_name'
  | 'missing_request';

export type ArtifactAdaptDecision<T> =
  | { ok: true; value: T }
  | { ok: false; refusal: ArtifactAdaptRefusal; detail: string };

export interface JsaAuthoredSnapshot {
  prepared: Record<string, boolean>;
  locationAcks: Record<string, boolean>;
  locations: string[];
  stepsAcknowledged: boolean;
  stepAcks: Record<string, boolean>;
  ppeSelected: Record<string, boolean>;
  ppeOtherItems: string[];
  notes: string;
  pusher: string;
  otherInfo: string;
  printedName: string;
  signature: { mimeType: typeof JSA_SIGNATURE_MIME; data: string };
  truckNumber?: string;
  formDate?: string;
}

export interface JsaPersistRequestBody {
  requestId: string;
  snapshot: JsaAuthoredSnapshot;
}

function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function isMapKey(k: string): boolean {
  return k.length >= 1 && k.length <= 64 && k.trim() === k && !/[\x00-\x1f\x7f]/.test(k);
}

function fail(refusal: ArtifactAdaptRefusal, detail: string): ArtifactAdaptDecision<never> {
  return { ok: false, refusal, detail };
}

function parseBoolMap(v: unknown): Record<string, boolean> {
  const o = rec(v);
  if (!o) return {};
  const out: Record<string, boolean> = {};
  for (const k of Object.keys(o).slice(0, LIMITS.mapKeys)) {
    if (!isMapKey(k) || typeof o[k] !== 'boolean') continue;
    out[k] = o[k];
  }
  return out;
}

function parseStringList(v: unknown, maxItems: number, maxItem: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v.slice(0, maxItems)) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || t.length > maxItem) continue;
    out.push(t);
  }
  return out;
}

function clip(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.length > max ? v.slice(0, max) : v;
}

function decodeBase64Strict(encoded: string): Uint8Array | null {
  if (!encoded || encoded.length % 4 !== 0 || !BASE64_RE.test(encoded)) return null;
  try {
    const buf = Buffer.from(encoded, 'base64');
    if (!buf.length) return null;
    if (buf.toString('base64') !== encoded) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export function decodeDrawnPng(raw: unknown): ArtifactAdaptDecision<{ mimeType: typeof JSA_SIGNATURE_MIME; data: string; byteSize: number }> {
  if (typeof raw !== 'string' || !raw.trim()) return fail('missing_png', 'signatureImage');
  let encoded = raw.trim();
  const dataUrl = /^data:([^;,]+);base64,(.+)$/i.exec(encoded);
  if (dataUrl) {
    if (dataUrl[1].toLowerCase() !== JSA_SIGNATURE_MIME) return fail('invalid_png', 'mime');
    encoded = dataUrl[2];
  }
  const bytes = decodeBase64Strict(encoded);
  if (!bytes) return fail('invalid_png', 'encoding');
  if (bytes.length > JSA_SIGNATURE_MAX_BYTES) return fail('oversized', 'signature_bytes');
  if (bytes.length < PNG_MAGIC.length) return fail('invalid_png', 'magic');
  for (let i = 0; i < PNG_MAGIC.length; i++) {
    if (bytes[i] !== PNG_MAGIC[i]) return fail('invalid_png', 'magic');
  }
  return {
    ok: true,
    value: {
      mimeType: JSA_SIGNATURE_MIME,
      data: Buffer.from(bytes).toString('base64'),
      byteSize: bytes.length,
    },
  };
}

function ppeFromRecord(raw: Record<string, unknown>): {
  ppeSelected: Record<string, boolean>;
  ppeOtherItems: string[];
} {
  let selected: unknown = raw.ppeSelected;
  let other: unknown = raw.ppeOtherItems;
  if (typeof selected === 'string') {
    try {
      const parsed = JSON.parse(selected);
      if (parsed && typeof parsed === 'object') {
        if (parsed.selected && typeof parsed.selected === 'object') {
          selected = parsed.selected;
          if (Array.isArray(parsed.otherItems)) other = parsed.otherItems;
        } else if (!Array.isArray(parsed)) {
          selected = parsed;
        }
      }
    } catch {
      selected = {};
    }
  }
  return {
    ppeSelected: parseBoolMap(selected),
    ppeOtherItems: parseStringList(other, LIMITS.ppeOther, LIMITS.ppeOtherItem),
  };
}

/**
 * Adapt a local save / submit payload. Drawn PNG is `signatureImage`.
 * Printed name is `signature` (the typed-name field). Never swapped.
 */
export function adaptGovernedSnapshot(raw: unknown): ArtifactAdaptDecision<JsaAuthoredSnapshot> {
  const o = rec(raw);
  if (!o) return fail('malformed', 'root');

  const printedName = clip(o.signature, LIMITS.printedName).trim();
  if (!printedName) return fail('missing_printed_name', 'signature');

  const png = decodeDrawnPng(o.signatureImage);
  if (!png.ok) return png;

  const ppe = ppeFromRecord(o);
  const snapshot: JsaAuthoredSnapshot = {
    prepared: parseBoolMap(o.prepared),
    locationAcks: parseBoolMap(o.locationAcks),
    locations: parseStringList(o.locations, LIMITS.locations, LIMITS.locationItem),
    stepsAcknowledged: o.stepsAcknowledged === true,
    stepAcks: parseBoolMap(o.stepAcks),
    ppeSelected: ppe.ppeSelected,
    ppeOtherItems: ppe.ppeOtherItems,
    notes: clip(o.notes, LIMITS.notes),
    pusher: clip(o.pusher, LIMITS.pusher).trim(),
    otherInfo: clip(o.otherInfo, LIMITS.otherInfo),
    printedName,
    signature: { mimeType: png.value.mimeType, data: png.value.data },
  };
  const truck = clip(o.truckNumber, LIMITS.truckNumber).trim();
  if (truck) snapshot.truckNumber = truck;
  if (typeof o.date === 'string' && FORM_DATE_RE.test(o.date)) {
    snapshot.formDate = o.date;
  }
  return { ok: true, value: snapshot };
}

export function persistRequestBody(
  requestId: string,
  snapshot: JsaAuthoredSnapshot,
): ArtifactAdaptDecision<JsaPersistRequestBody> {
  if (!isJsaRequestId(requestId)) return fail('missing_request', 'requestId');
  const body: JsaPersistRequestBody = { requestId, snapshot };
  const keys = Object.keys(body);
  if (keys.some((k) => k !== 'requestId' && k !== 'snapshot')) {
    return fail('malformed', 'root');
  }
  const snapKeys = Object.keys(snapshot);
  if (snapKeys.some((k) => AUTHORITY_KEYS.includes(k))) {
    return fail('malformed', 'authority');
  }
  const encoded = JSON.stringify(body);
  if (encoded.length > JSA_SNAPSHOT_MAX_JSON_CHARS + 64) return fail('oversized', 'payload');
  return { ok: true, value: body };
}

export function persistBodyHasNoAuthority(body: JsaPersistRequestBody): boolean {
  const blob = JSON.stringify(body);
  return !AUTHORITY_KEYS.some((k) => new RegExp(`"${k}"\\s*:`).test(blob));
}

export function governedRequestRefOf(raw: unknown): string | null {
  const o = rec(raw);
  if (!o || !isJsaRequestId(o.governedRequestRef)) return null;
  return o.governedRequestRef;
}

export function localRecordIdOf(raw: unknown): string | null {
  const o = rec(raw);
  if (!o || typeof o.id !== 'string' || !o.id) return null;
  return o.id;
}

/**
 * vc13 submit evidence. `@jsa/saves` records receive `governedRequestRef`
 * only on the Submit path after a drawn PNG is required. Drafts live in
 * other keys and never get that field. That pair is the stored-field
 * proof — there is no separate `submitted: true` boolean on vc13.
 */
export function vc13SaveProvesExplicitSubmit(raw: unknown): boolean {
  if (!governedRequestRefOf(raw)) return false;
  const png = decodeDrawnPng(rec(raw)?.signatureImage);
  return png.ok;
}

export function saveAlreadyPersistedArtifact(raw: unknown): boolean {
  const o = rec(raw);
  const stamp = rec(o?.governedArtifact);
  return stamp?.persisted === true;
}

export const JSA_ARTIFACT_QUEUE_SCHEMA = 1;
export const GOVERNED_ARTIFACT_QUEUE_KEY = '@jsa/governedArtifactQueue';
export const ARTIFACT_BACKOFF_MS = Object.freeze([2_000, 5_000, 15_000, 30_000, 60_000, 120_000]);

export type ArtifactStatusCode =
  | 'queued'
  | 'complete_unsent'
  | 'complete_retry'
  | 'persist_unsent'
  | 'created'
  | 'reused'
  | 'auth_unavailable'
  | 'network'
  | 'unavailable'
  | 'rate_limited'
  | 'pending'
  | 'conflict'
  | 'malformed'
  | 'binding_mismatch'
  | 'wrong_audience'
  | 'not_a_driver'
  | 'authority_unverifiable'
  | 'not_found'
  | 'permission'
  | 'blocked';

export type ArtifactClass = 'retryable' | 'success' | 'blocked';

export interface ArtifactQueueItem {
  schemaVersion: typeof JSA_ARTIFACT_QUEUE_SCHEMA;
  requestId: string;
  localRecordId: string;
  snapshot: JsaAuthoredSnapshot;
  action: JsaCompletionAction | null;
  submitCommitted: true;
  submitCommittedAtMs: number;
  completeState: 'unsent' | 'completed';
  artifactState: 'unsent' | 'succeeded' | 'blocked';
  attemptCount: number;
  nextAttemptAtMs: number;
  lastStatus: ArtifactStatusCode;
  createdAtMs: number;
}

export interface ArtifactSaveStamp {
  persisted: true;
  reused: boolean;
  persistedAtMs: number;
}

export function classifyArtifactStatus(code: string): ArtifactClass {
  if (code === 'created' || code === 'reused') return 'success';
  if (
    code === 'conflict'
    || code === 'malformed'
    || code === 'binding_mismatch'
    || code === 'wrong_audience'
    || code === 'not_a_driver'
    || code === 'authority_unverifiable'
    || code === 'not_found'
    || code === 'permission'
    || code === 'blocked'
  ) {
    return 'blocked';
  }
  return 'retryable';
}

export function classifyPersistRefusal(refusal: string): ArtifactStatusCode {
  switch (refusal) {
    case 'unauthenticated': return 'auth_unavailable';
    case 'network': return 'network';
    case 'complete_failed': return 'unavailable';
    case 'rate_limited': return 'rate_limited';
    case 'pending': return 'pending';
    case 'conflict': return 'conflict';
    case 'malformed': return 'malformed';
    case 'binding_mismatch': return 'binding_mismatch';
    case 'wrong_audience': return 'wrong_audience';
    case 'not_a_driver': return 'not_a_driver';
    case 'authority_unverifiable': return 'authority_unverifiable';
    case 'not_found': return 'not_found';
    case 'jsa_disabled':
    case 'active_shift_required':
    case 'intent_not_permitted':
    case 'action_not_permitted':
      return 'permission';
    default: return 'unavailable';
  }
}

export function nextBackoffMs(attemptCount: number): number {
  const i = Math.max(0, Math.min(ARTIFACT_BACKOFF_MS.length - 1, attemptCount));
  return ARTIFACT_BACKOFF_MS[i];
}

export function parseQueueItem(raw: unknown): ArtifactQueueItem | null {
  const o = rec(raw);
  if (!o || o.schemaVersion !== JSA_ARTIFACT_QUEUE_SCHEMA) return null;
  if (!isJsaRequestId(o.requestId)) return null;
  if (typeof o.localRecordId !== 'string' || !o.localRecordId) return null;
  if (o.submitCommitted !== true) return null;
  if (typeof o.submitCommittedAtMs !== 'number') return null;
  const adapted = o.snapshot && typeof o.snapshot === 'object'
    ? { ok: true as const, value: o.snapshot as JsaAuthoredSnapshot }
    : { ok: false as const };
  if (!adapted.ok || !adapted.value?.signature?.data || !adapted.value.printedName) return null;
  const action = o.action == null ? null : (isCompletionAction(o.action) ? o.action : null);
  if (o.action != null && !action) return null;
  if (o.completeState !== 'unsent' && o.completeState !== 'completed') return null;
  if (o.artifactState !== 'unsent' && o.artifactState !== 'succeeded' && o.artifactState !== 'blocked') {
    return null;
  }
  return {
    schemaVersion: JSA_ARTIFACT_QUEUE_SCHEMA,
    requestId: o.requestId,
    localRecordId: o.localRecordId,
    snapshot: adapted.value,
    action,
    submitCommitted: true,
    submitCommittedAtMs: o.submitCommittedAtMs,
    completeState: o.completeState,
    artifactState: o.artifactState,
    attemptCount: typeof o.attemptCount === 'number' ? o.attemptCount : 0,
    nextAttemptAtMs: typeof o.nextAttemptAtMs === 'number' ? o.nextAttemptAtMs : 0,
    lastStatus: typeof o.lastStatus === 'string' ? o.lastStatus as ArtifactStatusCode : 'queued',
    createdAtMs: typeof o.createdAtMs === 'number' ? o.createdAtMs : o.submitCommittedAtMs,
  };
}

export function upsertQueueItem(
  items: ArtifactQueueItem[],
  next: ArtifactQueueItem,
): ArtifactQueueItem[] {
  return [...items.filter((i) => i.requestId !== next.requestId), next];
}

export function removeQueueItem(
  items: ArtifactQueueItem[],
  requestId: string,
): ArtifactQueueItem[] {
  return items.filter((i) => i.requestId !== requestId);
}

export function freezeQueueItem(input: {
  requestId: string;
  localRecordId: string;
  snapshot: JsaAuthoredSnapshot;
  action: JsaCompletionAction | null;
  nowMs: number;
}): ArtifactQueueItem {
  return {
    schemaVersion: JSA_ARTIFACT_QUEUE_SCHEMA,
    requestId: input.requestId,
    localRecordId: input.localRecordId,
    snapshot: input.snapshot,
    action: input.action,
    submitCommitted: true,
    submitCommittedAtMs: input.nowMs,
    completeState: input.action ? 'unsent' : 'completed',
    artifactState: 'unsent',
    attemptCount: 0,
    nextAttemptAtMs: input.nowMs,
    lastStatus: input.action ? 'complete_unsent' : 'persist_unsent',
    createdAtMs: input.nowMs,
  };
}

export function applyStatus(
  item: ArtifactQueueItem,
  status: ArtifactStatusCode,
  nowMs: number,
): ArtifactQueueItem {
  const klass = classifyArtifactStatus(status);
  if (klass === 'success') {
    return {
      ...item,
      completeState: 'completed',
      artifactState: 'succeeded',
      lastStatus: status,
      nextAttemptAtMs: nowMs,
    };
  }
  if (klass === 'blocked') {
    return {
      ...item,
      artifactState: 'blocked',
      lastStatus: status,
      nextAttemptAtMs: Number.MAX_SAFE_INTEGER,
    };
  }
  const attemptCount = item.attemptCount + 1;
  return {
    ...item,
    attemptCount,
    lastStatus: status,
    nextAttemptAtMs: nowMs + nextBackoffMs(attemptCount - 1),
    completeState: status === 'pending' || status === 'complete_retry' || status === 'complete_unsent'
      ? 'unsent'
      : item.completeState,
  };
}

export function markCompleteDone(item: ArtifactQueueItem): ArtifactQueueItem {
  return { ...item, completeState: 'completed', lastStatus: 'persist_unsent' };
}

export function itemIsDue(item: ArtifactQueueItem, nowMs: number): boolean {
  if (item.artifactState === 'succeeded' || item.artifactState === 'blocked') return false;
  return nowMs >= item.nextAttemptAtMs;
}

export function mayCompleteFromQueue(item: Pick<ArtifactQueueItem, 'submitCommitted' | 'completeState' | 'action'>): boolean {
  return item.submitCommitted === true
    && item.completeState === 'unsent'
    && isCompletionAction(item.action);
}

export function mayPersistFromQueue(item: Pick<ArtifactQueueItem, 'submitCommitted' | 'artifactState' | 'completeState' | 'action'>): boolean {
  return item.submitCommitted === true
    && item.artifactState === 'unsent'
    && (item.completeState === 'completed' || !item.action);
}

export type SubmitGate =
  | { ok: true; next: 'enqueue' }
  | { ok: false; refusal: 'local_save_failed' | 'queue_failed' | 'malformed' };

export function decideSubmitGate(input: {
  localSaveOk: boolean;
  snapshotOk: boolean;
}): SubmitGate {
  if (!input.snapshotOk) return { ok: false, refusal: 'malformed' };
  if (!input.localSaveOk) return { ok: false, refusal: 'local_save_failed' };
  return { ok: true, next: 'enqueue' };
}

export function decideAfterQueue(queueOk: boolean): { mayComplete: boolean } {
  return { mayComplete: queueOk };
}

export type RecoverableSave =
  | {
      ok: true;
      requestId: string;
      localRecordId: string;
      snapshot: JsaAuthoredSnapshot;
      action: JsaCompletionAction | null;
    }
  | { ok: false; reason: string };

export function recoverSaveAsQueueCandidate(
  raw: unknown,
  queuedRequestIds: Set<string>,
): RecoverableSave {
  if (saveAlreadyPersistedArtifact(raw)) return { ok: false, reason: 'already_persisted' };
  const requestId = governedRequestRefOf(raw);
  if (!requestId) return { ok: false, reason: 'not_governed' };
  if (queuedRequestIds.has(requestId)) return { ok: false, reason: 'already_queued' };
  if (!localRecordIdOf(raw)) return { ok: false, reason: 'missing_id' };
  if (!vc13SaveProvesExplicitSubmit(raw)) return { ok: false, reason: 'no_submit_evidence' };
  const adapted = adaptGovernedSnapshot(raw);
  if (!adapted.ok) return { ok: false, reason: adapted.refusal };
  const commit = rec(rec(raw)?.governedSubmitCommit);
  const action = commit && isCompletionAction(commit.action) ? commit.action : null;
  return {
    ok: true,
    requestId,
    localRecordId: localRecordIdOf(raw) as string,
    snapshot: adapted.value,
    action,
  };
}

export function scanSavesForRecovery(
  saves: unknown[],
  queue: ArtifactQueueItem[],
): ArtifactQueueItem[] {
  const queued = new Set(queue.map((i) => i.requestId));
  const additions: ArtifactQueueItem[] = [];
  for (const save of saves) {
    const found = recoverSaveAsQueueCandidate(save, queued);
    if (!found.ok) continue;
    queued.add(found.requestId);
    additions.push(freezeQueueItem({
      requestId: found.requestId,
      localRecordId: found.localRecordId,
      snapshot: found.snapshot,
      action: found.action,
      nowMs: 0,
    }));
  }
  return additions;
}

export function isDraftRecord(raw: unknown): boolean {
  const o = rec(raw);
  if (!o) return true;
  if (o.draft === true || o.status === 'draft') return true;
  return !governedRequestRefOf(raw);
}

export type PipelineStep =
  | 'validate'
  | 'local_save'
  | 'enqueue'
  | 'complete'
  | 'persist'
  | 'stamp_and_dequeue';

export function requiredSubmitOrder(): readonly PipelineStep[] {
  return ['validate', 'local_save', 'enqueue', 'complete', 'persist', 'stamp_and_dequeue'];
}

export interface JsaPersistResult {
  requestId: string;
  reused: boolean;
  schemaVersion: number;
  snapshotHash: string;
  artifactWrittenAtMs: number;
  signature: {
    mimeType: string;
    encoding: string;
    byteSize: number;
    sha256: string;
  };
}

export function parsePersistResult(raw: unknown): { ok: true; value: JsaPersistResult } | { ok: false } {
  const o = rec(raw);
  if (!o) return { ok: false };
  if (!isJsaRequestId(o.requestId)) return { ok: false };
  if (typeof o.reused !== 'boolean') return { ok: false };
  if (typeof o.schemaVersion !== 'number') return { ok: false };
  if (typeof o.snapshotHash !== 'string' || !o.snapshotHash) return { ok: false };
  if (typeof o.artifactWrittenAtMs !== 'number') return { ok: false };
  const sig = rec(o.signature);
  if (!sig || typeof sig.sha256 !== 'string' || typeof sig.byteSize !== 'number') return { ok: false };
  if ('dataBase64' in sig || 'data' in sig) return { ok: false };
  return {
    ok: true,
    value: {
      requestId: o.requestId,
      reused: o.reused,
      schemaVersion: o.schemaVersion,
      snapshotHash: o.snapshotHash,
      artifactWrittenAtMs: o.artifactWrittenAtMs,
      signature: {
        mimeType: typeof sig.mimeType === 'string' ? sig.mimeType : 'image/png',
        encoding: typeof sig.encoding === 'string' ? sig.encoding : 'base64',
        byteSize: sig.byteSize,
        sha256: sig.sha256,
      },
    },
  };
}

export function classifyPersistError(err: unknown): ArtifactStatusCode {
  const code = String((err as { code?: unknown } | null)?.code || '').toLowerCase();
  if (code.includes('resource-exhausted')) return 'rate_limited';
  if (code.includes('unavailable') || code.includes('internal')) return 'unavailable';
  const details = rec((err as { details?: unknown } | null)?.details);
  const detailRefusal = typeof details?.refusal === 'string' ? details.refusal : '';
  const message = String((err as { message?: unknown } | null)?.message || '');
  const blob = `${code} ${detailRefusal} ${message}`.toLowerCase();
  if (blob.includes('unauthenticated')) return 'auth_unavailable';
  if (detailRefusal === 'pending' || blob.includes('pending')) return 'pending';
  return classifyPersistRefusal(detailRefusal || blob);
}

export interface ArtifactQueueStore {
  nowMs(): number;
  loadQueue(): Promise<ArtifactQueueItem[]>;
  saveQueue(items: ArtifactQueueItem[]): Promise<void>;
  loadSaves(): Promise<unknown[]>;
  stampSave(localRecordId: string, stamp: ArtifactSaveStamp): Promise<void>;
  complete(requestId: string, action: JsaCompletionAction, localRecordId: string): Promise<
    | { kind: 'completed'; reused: boolean; action: JsaCompletionAction }
    | { kind: 'pending_retry'; refusal: string }
    | { kind: 'fail_closed'; refusal: string }
  >;
  persist(requestId: string, snapshot: JsaAuthoredSnapshot): Promise<
    | { ok: true; reused: boolean }
    | { ok: false; status: ArtifactStatusCode }
  >;
  log(outcome: string): void;
}

const inFlight = new Map<string, Promise<void>>();

export async function enqueueFrozenSnapshot(
  store: ArtifactQueueStore,
  input: {
    requestId: string;
    localRecordId: string;
    snapshot: JsaAuthoredSnapshot;
    action: JsaCompletionAction | null;
  },
): Promise<ArtifactQueueItem | null> {
  try {
    const items = await store.loadQueue();
    const existing = items.find((i) => i.requestId === input.requestId);
    if (existing) return existing;
    const item = freezeQueueItem({ ...input, nowMs: store.nowMs() });
    await store.saveQueue(upsertQueueItem(items, item));
    store.log('queued');
    return item;
  } catch {
    store.log('queue_failed');
    return null;
  }
}

async function processItem(store: ArtifactQueueStore, item: ArtifactQueueItem): Promise<ArtifactQueueItem> {
  let current = item;
  if (mayCompleteFromQueue(current) && current.action) {
    const done = await store.complete(current.requestId, current.action, current.localRecordId);
    if (done.kind === 'completed') current = markCompleteDone(current);
    else if (done.kind === 'fail_closed' && done.refusal === 'conflict') {
      return applyStatus(current, 'conflict', store.nowMs());
    } else {
      const status: ArtifactStatusCode = done.refusal === 'unauthenticated' ? 'auth_unavailable'
        : done.refusal === 'network' ? 'network'
          : done.refusal === 'malformed' ? 'malformed'
            : 'complete_retry';
      return applyStatus(current, status, store.nowMs());
    }
  }
  if (!mayPersistFromQueue(current) && current.completeState !== 'completed') return current;
  const persisted = await store.persist(current.requestId, current.snapshot);
  if (persisted.ok) {
    const status: ArtifactStatusCode = persisted.reused ? 'reused' : 'created';
    current = applyStatus(current, status, store.nowMs());
    await store.stampSave(current.localRecordId, {
      persisted: true,
      reused: persisted.reused,
      persistedAtMs: store.nowMs(),
    });
    store.log(status);
    return current;
  }
  current = applyStatus(current, persisted.status, store.nowMs());
  store.log(persisted.status);
  return current;
}

export async function settleArtifactQueue(store: ArtifactQueueStore): Promise<void> {
  const saves = await store.loadSaves();
  let items = await store.loadQueue();
  const additions = scanSavesForRecovery(saves, items);
  if (additions.length) {
    for (const add of additions) {
      items = upsertQueueItem(items, { ...add, nextAttemptAtMs: store.nowMs(), createdAtMs: store.nowMs() });
    }
    await store.saveQueue(items);
    store.log('recovered');
  }
  const due = items.filter((i) => itemIsDue(i, store.nowMs()));
  for (const item of due) {
    const existing = inFlight.get(item.requestId);
    if (existing) {
      await existing;
      continue;
    }
    const run = (async () => {
      const latest = (await store.loadQueue()).find((i) => i.requestId === item.requestId) || item;
      if (!itemIsDue(latest, store.nowMs())) return;
      const next = await processItem(store, latest);
      const q = await store.loadQueue();
      if (next.artifactState === 'succeeded') await store.saveQueue(removeQueueItem(q, next.requestId));
      else await store.saveQueue(upsertQueueItem(q, next));
    })().finally(() => { inFlight.delete(item.requestId); });
    inFlight.set(item.requestId, run);
    await run;
  }
}

export async function commitGovernedAfterLocalSaveWithStore(
  store: ArtifactQueueStore,
  input: {
    requestId: string;
    action: JsaCompletionAction;
    localRecordId: string;
    snapshot: JsaAuthoredSnapshot;
    localSaveOk: boolean;
  },
): Promise<
  | { kind: 'completed'; reused: boolean; action: JsaCompletionAction }
  | { kind: 'pending_retry'; refusal: string; copy: string }
  | { kind: 'fail_closed'; refusal: string; copy: string }
> {
  const gate = decideSubmitGate({ localSaveOk: input.localSaveOk, snapshotOk: true });
  if (!gate.ok) {
    return {
      kind: 'fail_closed',
      refusal: gate.refusal,
      copy: gate.refusal === 'local_save_failed'
        ? 'Your JSA could not be saved on this device. Stay here and try again. Do not return to Tickets yet.'
        : 'This JSA request is not valid. Return to WellBuilt Tickets and launch again.',
    };
  }
  const queued = await enqueueFrozenSnapshot(store, {
    requestId: input.requestId,
    localRecordId: input.localRecordId,
    snapshot: input.snapshot,
    action: input.action,
  });
  if (!queued) {
    return {
      kind: 'fail_closed',
      refusal: 'queue_failed',
      copy: 'Your JSA is saved on this device, but could not be queued for WellBuilt. Stay here and try again. Do not return to Tickets yet.',
    };
  }
  const done = await store.complete(input.requestId, input.action, input.localRecordId);
  const q = await store.loadQueue();
  const current = q.find((i) => i.requestId === input.requestId) || queued;
  if (done.kind !== 'completed') {
    const next = applyStatus(
      current,
      done.refusal === 'conflict' ? 'conflict' : 'complete_retry',
      store.nowMs(),
    );
    await store.saveQueue(upsertQueueItem(q, next));
    if (done.kind === 'pending_retry') {
      return {
        kind: 'pending_retry',
        refusal: done.refusal,
        copy: 'Your JSA is saved on this device, but WellBuilt could not record completion. Stay here and tap Retry. Do not return to Tickets yet.',
      };
    }
    return {
      kind: 'fail_closed',
      refusal: done.refusal,
      copy: 'This JSA request was already completed differently. Return to WellBuilt Tickets and launch again.',
    };
  }
  let next = markCompleteDone(current);
  const persisted = await store.persist(input.requestId, input.snapshot);
  if (persisted.ok) {
    next = applyStatus(next, persisted.reused ? 'reused' : 'created', store.nowMs());
    await store.stampSave(input.localRecordId, {
      persisted: true,
      reused: persisted.reused,
      persistedAtMs: store.nowMs(),
    });
    await store.saveQueue(removeQueueItem(q, input.requestId));
    store.log(persisted.reused ? 'reused' : 'created');
  } else {
    next = applyStatus(next, persisted.status, store.nowMs());
    await store.saveQueue(upsertQueueItem(q, next));
    store.log(persisted.status);
  }
  return { kind: 'completed', reused: done.reused, action: done.action };
}

export function resetArtifactSingleFlightForTests(): void {
  inFlight.clear();
}
