/**
 * Per-JSA PPE / prepared attestation draft.
 * Import-free. One replaceable envelope. Never treats device-global
 * PPE/prepared keys or route/launch requestIds as current-JSA authority.
 * Signature storage is intentionally out of this module.
 */

export const ATTESTATION_DRAFT_KEY = '@jsa/attestationDraft';

export const LEGACY_ATTESTATION_KEYS = Object.freeze([
  '@jsa/ppe/selected',
  '@jsa/ppe/other',
  '@jsa/prepared',
]);

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,64}$/;
const ENVELOPE_MAX_CHARS = 16_000;
const MAP_KEYS_MAX = 40;
const PPE_OTHER_MAX = 16;
const PPE_OTHER_ITEM_MAX = 80;

export type AttestationHandoffSource =
  | 'governed_snapshot'
  | 'nav_params'
  | 'blocked'
  | 'completed'
  | 'acknowledge_only';

export type AttestationKind = 'governed' | 'standalone';

export interface AttestationScope {
  kind: AttestationKind;
  scopeId: string;
}

export interface AttestationState {
  ppeSelected: Record<string, boolean>;
  ppeOther: string[];
  prepared: Record<string, boolean>;
}

export interface AttestationEnvelope extends AttestationState {
  v: 1;
  kind: AttestationKind;
  scopeId: string;
}

export type AttestationScopeDecision =
  | { kind: 'ready'; scope: AttestationScope }
  | {
      kind: 'none';
      reason: 'pending_or_invalid' | 'governed_unresolved' | 'standalone_missing_session';
    };

export type AttestationCompletionOutcome =
  | 'succeeded'
  | 'pending_retry'
  | 'fail_closed'
  | 'local_save_failed';

export interface AttestationStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export function emptyAttestation(): AttestationState {
  return { ppeSelected: {}, ppeOther: [], prepared: {} };
}

export function isGovernedAttestationRequestId(v: unknown): v is string {
  return typeof v === 'string' && REQUEST_ID_RE.test(v);
}

export function isStandaloneSessionId(v: unknown): v is string {
  return typeof v === 'string' && SESSION_ID_RE.test(v);
}

/**
 * Governed scope is the protected-handoff requestId only.
 * Standalone scope is the generated jsaSessionId.
 * Route/launch requestIds are not inputs.
 */
export function decideAttestationScope(input: {
  source: AttestationHandoffSource | null | undefined;
  governedRequestId?: string | null;
  standaloneSessionId?: string | null;
}): AttestationScopeDecision {
  if (input.source === 'governed_snapshot') {
    const id = typeof input.governedRequestId === 'string' ? input.governedRequestId : '';
    if (!isGovernedAttestationRequestId(id)) {
      return { kind: 'none', reason: 'governed_unresolved' };
    }
    return { kind: 'ready', scope: { kind: 'governed', scopeId: id } };
  }
  if (input.source === 'nav_params') {
    const id = typeof input.standaloneSessionId === 'string' ? input.standaloneSessionId.trim() : '';
    if (!isStandaloneSessionId(id)) {
      return { kind: 'none', reason: 'standalone_missing_session' };
    }
    return { kind: 'ready', scope: { kind: 'standalone', scopeId: id } };
  }
  return { kind: 'none', reason: 'pending_or_invalid' };
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

function parseBoolMap(raw: unknown): Record<string, boolean> | null {
  const o = rec(raw);
  if (!o) return null;
  const keys = Object.keys(o);
  if (keys.length > MAP_KEYS_MAX) return null;
  const out: Record<string, boolean> = {};
  for (const k of keys) {
    if (typeof k !== 'string' || !k || k.length > 80) return null;
    if (typeof o[k] !== 'boolean') return null;
    out[k] = o[k];
  }
  return out;
}

function parseOther(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  if (raw.length > PPE_OTHER_MAX) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') return null;
    const t = item.trim();
    if (!t || t.length > PPE_OTHER_ITEM_MAX) return null;
    out.push(t);
  }
  return out;
}

export function parseAttestationEnvelope(raw: unknown): AttestationEnvelope | null {
  let value = raw;
  if (typeof raw === 'string') {
    if (raw.length > ENVELOPE_MAX_CHARS) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const o = rec(value);
  if (!o || o.v !== 1) return null;
  if (o.kind !== 'governed' && o.kind !== 'standalone') return null;
  if (typeof o.scopeId !== 'string') return null;
  if (o.kind === 'governed' && !isGovernedAttestationRequestId(o.scopeId)) return null;
  if (o.kind === 'standalone' && !isStandaloneSessionId(o.scopeId)) return null;
  const ppeSelected = parseBoolMap(o.ppeSelected);
  const prepared = parseBoolMap(o.prepared);
  const ppeOther = parseOther(o.ppeOther);
  if (!ppeSelected || !prepared || !ppeOther) return null;
  return {
    v: 1,
    kind: o.kind,
    scopeId: o.scopeId,
    ppeSelected,
    ppeOther,
    prepared,
  };
}

export function envelopeMatchesScope(
  env: AttestationEnvelope,
  scope: AttestationScope,
): boolean {
  return env.kind === scope.kind && env.scopeId === scope.scopeId;
}

export function attestationFromEnvelope(env: AttestationEnvelope): AttestationState {
  return {
    ppeSelected: { ...env.ppeSelected },
    ppeOther: [...env.ppeOther],
    prepared: { ...env.prepared },
  };
}

export function loadAttestationForScope(
  raw: unknown,
  scope: AttestationScope,
): AttestationState {
  const env = parseAttestationEnvelope(raw);
  if (!env || !envelopeMatchesScope(env, scope)) return emptyAttestation();
  return attestationFromEnvelope(env);
}

function sanitizeState(patch: Partial<AttestationState>): AttestationState {
  const base = emptyAttestation();
  const selected = parseBoolMap(patch.ppeSelected ?? {});
  const prepared = parseBoolMap(patch.prepared ?? {});
  const other = parseOther(patch.ppeOther ?? []);
  return {
    ppeSelected: selected || base.ppeSelected,
    ppeOther: other || base.ppeOther,
    prepared: prepared || base.prepared,
  };
}

export function buildAttestationEnvelope(
  scope: AttestationScope,
  state: AttestationState,
): AttestationEnvelope | null {
  if (scope.kind === 'governed' && !isGovernedAttestationRequestId(scope.scopeId)) return null;
  if (scope.kind === 'standalone' && !isStandaloneSessionId(scope.scopeId)) return null;
  const clean = sanitizeState(state);
  return {
    v: 1,
    kind: scope.kind,
    scopeId: scope.scopeId,
    ...clean,
  };
}

export function shouldClearAttestationDraft(
  outcome: AttestationCompletionOutcome,
): boolean {
  return outcome === 'succeeded';
}

export async function readAttestationDraft(
  store: AttestationStore,
  scope: AttestationScope,
): Promise<AttestationState> {
  let raw: string | null = null;
  try {
    raw = await store.getItem(ATTESTATION_DRAFT_KEY);
  } catch {
    return emptyAttestation();
  }
  return loadAttestationForScope(raw, scope);
}

export async function writeAttestationDraft(
  store: AttestationStore,
  scope: AttestationScope,
  patch: Partial<AttestationState>,
): Promise<boolean> {
  const existing = await readAttestationDraft(store, scope);
  const next = buildAttestationEnvelope(scope, {
    ppeSelected: patch.ppeSelected ?? existing.ppeSelected,
    ppeOther: patch.ppeOther ?? existing.ppeOther,
    prepared: patch.prepared ?? existing.prepared,
  });
  if (!next) return false;
  const encoded = JSON.stringify(next);
  if (encoded.length > ENVELOPE_MAX_CHARS) return false;
  try {
    await store.setItem(ATTESTATION_DRAFT_KEY, encoded);
    return true;
  } catch {
    return false;
  }
}

export async function clearAttestationDraftIfMatching(
  store: AttestationStore,
  scope: AttestationScope,
): Promise<'cleared' | 'retained'> {
  let raw: string | null = null;
  try {
    raw = await store.getItem(ATTESTATION_DRAFT_KEY);
  } catch {
    return 'retained';
  }
  const env = parseAttestationEnvelope(raw);
  if (!env || !envelopeMatchesScope(env, scope)) return 'retained';
  try {
    await store.removeItem(ATTESTATION_DRAFT_KEY);
    return 'cleared';
  } catch {
    return 'retained';
  }
}

export async function applyAttestationCompletion(
  store: AttestationStore,
  scope: AttestationScope,
  outcome: AttestationCompletionOutcome,
): Promise<'cleared' | 'retained'> {
  if (!shouldClearAttestationDraft(outcome)) return 'retained';
  return clearAttestationDraftIfMatching(store, scope);
}

export async function forgetLegacyAttestationKeys(
  store: AttestationStore,
): Promise<void> {
  for (const key of LEGACY_ATTESTATION_KEYS) {
    try {
      await store.removeItem(key);
    } catch {
      // best-effort only; scope matching is the authority
    }
  }
}

export function isLegacyAttestationKey(key: string): boolean {
  return (LEGACY_ATTESTATION_KEYS as readonly string[]).includes(key);
}
