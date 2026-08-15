/**
 * Governed Firebase Auth predicates and bounded unauthenticated-get recovery.
 *
 * JsaGovernedSession is descriptive application state, not a credential.
 * Suite may be skipped only when the stored object passes strict schema
 * validation AND Firebase Auth has a current user whose uid exactly
 * matches session.uid. Auth readiness must be awaited first so a
 * transient pre-hydration null is not treated as signed-out.
 *
 * Recovery latch identity:
 *   Existing PKCE authorization attempt `{ state, createdAtMs }` plus the
 *   existing 180s attempt TTL. takeOwnedLaunch cannot distinguish a WB-T
 *   relaunch of the same requestId from getInitialURL redelivery (duplicate
 *   keeps receivedAtMs), so the latch is not keyed permanently to
 *   requestId and is not process-lifetime alone. In-window duplicate
 *   deliveries share the attempt and cannot start a second recovery.
 *   After TTL the existing mint path may create a new attempt.
 *
 * Persistence (documented, live module):
 *   initializeAuth(same app as Functions, getReactNativePersistence(AsyncStorage)).
 *   Application SecureStore holds only the sanitized session. The Auth SDK
 *   persists its own user record so currentUser can restore. This module
 *   never copies customToken / ID token / refresh token into app storage
 *   or logs.
 */

/** Import-free so node --experimental-strip-types tests can load this leaf. */

export interface GovernedAuthBinding {
  shiftState: 'open' | 'none';
  periodId?: string;
  originLocalDate?: string;
  requiresActiveShift: boolean;
  jsaEnabled: boolean;
}

export interface JsaGovernedSessionView {
  uid: string;
  driverId: string;
  companyId: string;
  displayName: string | null;
  legalName: string | null;
  binding: GovernedAuthBinding;
  generation: string;
}

export interface ExchangePayloadView {
  protocolVersion: number;
  customToken: string;
  uid: string;
  driverId: string;
  companyId: string;
  displayName?: string;
  /** Optional. Server-resolved JSA-only acknowledgment identity. */
  legalName?: string;
  jsaBinding?: GovernedAuthBinding;
}

/** Matches backend CANONICAL_LEGAL_NAME_MAX / registration NAME_MAX_LEN. */
export const GOVERNED_LEGAL_NAME_MAX = 64;

/**
 * Authenticated exchange legalName. String, trim nonempty, ≤64, and not
 * the same as displayName (case-insensitive after normalization). Fail
 * any check → null. Never substitutes displayName.
 */
export function resolveGovernedLegalName(
  raw: unknown,
  displayName?: string | null,
): string | null {
  if (typeof raw !== 'string') return null;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return null;
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  if (!collapsed || collapsed.length > GOVERNED_LEGAL_NAME_MAX) return null;
  const display = typeof displayName === 'string'
    ? displayName.replace(/\s+/g, ' ').trim()
    : '';
  if (display && collapsed.toLowerCase() === display.toLowerCase()) return null;
  return collapsed;
}

export type ExchangeLegalNameClass =
  | { kind: 'absent' }
  | { kind: 'ok'; value: string }
  | { kind: 'invalid' };

/**
 * Own-property classification for an exchange payload's legalName.
 * Absent → persist null. Present valid → persist normalized.
 * Present invalid → reject the entire exchange.
 */
export function classifyExchangeLegalName(
  payload: unknown,
  displayName?: string | null,
): ExchangeLegalNameClass {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { kind: 'absent' };
  }
  const o = payload as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(o, 'legalName')) {
    return { kind: 'absent' };
  }
  const resolved = resolveGovernedLegalName(o.legalName, displayName);
  if (!resolved) return { kind: 'invalid' };
  return { kind: 'ok', value: resolved };
}

export const SESSION_FORBIDDEN_PERSIST_KEYS = Object.freeze([
  'customToken',
  'idToken',
  'refreshToken',
  'accessToken',
  'code',
  'authorizationCode',
  'codeVerifier',
  'verifier',
]);

const SESSION_REQUIRED_KEYS = Object.freeze([
  'uid',
  'driverId',
  'companyId',
  'displayName',
  'legalName',
  'binding',
  'generation',
]);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Same rules as isJsaBinding — kept local so this module stays a test leaf. */
function isPersistedBinding(v: unknown): v is GovernedAuthBinding {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  if (typeof o.requiresActiveShift !== 'boolean' || typeof o.jsaEnabled !== 'boolean') return false;
  const keys = Object.keys(o);
  if (o.shiftState === 'open') {
    if (keys.length !== 5) return false;
    if (typeof o.periodId !== 'string' || !/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(o.periodId)) return false;
    if (typeof o.originLocalDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.originLocalDate)) return false;
    return o.periodId.slice(0, 10) === o.originLocalDate;
  }
  if (o.shiftState === 'none') return keys.length === 3;
  return false;
}

export function validatePersistedGovernedSession(raw: unknown): JsaGovernedSessionView | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.some((k) => (SESSION_FORBIDDEN_PERSIST_KEYS as readonly string[]).includes(k))) {
    return null;
  }
  if (keys.length !== SESSION_REQUIRED_KEYS.length) return null;
  for (const k of SESSION_REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) return null;
  }
  if (!isNonEmptyString(o.uid)) return null;
  if (!isNonEmptyString(o.driverId)) return null;
  if (!isNonEmptyString(o.companyId)) return null;
  if (o.displayName !== null && typeof o.displayName !== 'string') return null;
  if (o.legalName !== null && typeof o.legalName !== 'string') return null;
  if (!isPersistedBinding(o.binding)) return null;
  if (!isNonEmptyString(o.generation)) return null;
  return {
    uid: o.uid,
    driverId: o.driverId,
    companyId: o.companyId,
    displayName: o.displayName,
    legalName: o.legalName,
    binding: o.binding,
    generation: o.generation,
  };
}

export function sanitizeSessionForPersist(session: JsaGovernedSessionView): JsaGovernedSessionView {
  return {
    uid: session.uid,
    driverId: session.driverId,
    companyId: session.companyId,
    displayName: session.displayName,
    legalName: session.legalName,
    binding: session.binding,
    generation: session.generation,
  };
}

export function sessionViewFromExchange(
  payload: ExchangePayloadView,
  legalName: string | null,
  generation: string,
): JsaGovernedSessionView {
  return {
    uid: payload.uid,
    driverId: payload.driverId,
    companyId: payload.companyId,
    displayName: payload.displayName ?? null,
    legalName: resolveGovernedLegalName(
      legalName ?? payload.legalName,
      payload.displayName ?? null,
    ),
    binding: payload.jsaBinding as GovernedAuthBinding,
    generation,
  };
}

/** Same bound as SSO_ATTEMPT_TTL_MS / JSA_START_ATTEMPT_TTL_MS. */
export const AUTH_RECOVERY_LATCH_TTL_MS = 180_000;

/** Exact Firebase callable code. Blob/string matching must not recover. */
export const FUNCTIONS_UNAUTHENTICATED_CODE = 'functions/unauthenticated';

export type AuthRecoveryPhase = 'recovering' | 'exhausted';

export interface AuthRecoveryLatch {
  state: string;
  createdAtMs: number;
  usedAtMs: number;
  phase: AuthRecoveryPhase;
  /** Session generation whose get failed and started recovery. */
  failedGeneration: string | null;
  /** Session generation installed after Auth; only its unauthenticated get exhausts. */
  retryGeneration: string | null;
}

/** In-process mutex. Process death drops in-flight JS; this is not cross-process. */
export function createSerialQueue() {
  let tail: Promise<void> = Promise.resolve();
  return function enqueue<T>(work: () => Promise<T> | T): Promise<T> {
    const run = tail.then(() => work());
    tail = run.then(() => undefined, () => undefined);
    return run;
  };
}

export function createSerializedSessionMutator(io: {
  load(): Promise<JsaGovernedSessionView | null>;
  save(session: JsaGovernedSessionView): Promise<void>;
  clear(): Promise<void>;
}) {
  const enqueue = createSerialQueue();
  return {
    save(session: JsaGovernedSessionView) {
      return enqueue(() => io.save(session));
    },
    clear() {
      return enqueue(() => io.clear());
    },
    clearIfGeneration(used: string) {
      return enqueue(async () => {
        const current = await io.load();
        if (!mayClearSessionGeneration({
          usedGeneration: used,
          currentGeneration: current?.generation ?? null,
        })) {
          return false;
        }
        await io.clear();
        return true;
      });
    },
  };
}

export function classifyInitializeAuthError(err: unknown): 'already_initialized' | 'fail_closed' {
  const code = err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string'
    ? (err as { code: string }).code
    : '';
  return code === 'auth/already-initialized' ? 'already_initialized' : 'fail_closed';
}

export interface AuthAttemptIdentity {
  state: string;
  createdAtMs: number;
  consumed?: boolean;
}

export function exactCallableErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return '';
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export function isExactUnauthenticatedCode(err: unknown): boolean {
  return exactCallableErrorCode(err) === FUNCTIONS_UNAUTHENTICATED_CODE;
}

/**
 * Usability predicate. Call only after Auth restoration has completed.
 * authReady === false must not be treated as a negative currentUser.
 */
export function decideStoredSessionBranch(input: {
  raw: unknown;
  authReady: boolean;
  authUid: string | null;
}): 'await_auth' | 'need_auth' | 'usable' {
  if (!input.authReady) return 'await_auth';
  const session = validatePersistedGovernedSession(input.raw);
  if (!session) return 'need_auth';
  if (!input.authUid) return 'need_auth';
  if (session.uid !== input.authUid) return 'need_auth';
  return 'usable';
}

export function isUsableGovernedSession(input: {
  raw: unknown;
  authReady: boolean;
  authUid: string | null;
}): boolean {
  return decideStoredSessionBranch(input) === 'usable';
}

export function newSessionGeneration(nowMs: number, entropyHex: string): string {
  return `${nowMs}:${entropyHex}`;
}

export function sessionGenerationOf(raw: unknown): string | null {
  const session = validatePersistedGovernedSession(raw);
  return session ? session.generation : null;
}

export function mayClearSessionGeneration(input: {
  usedGeneration: string;
  currentGeneration: string | null;
}): boolean {
  return !!input.usedGeneration && input.currentGeneration === input.usedGeneration;
}

export function parseAuthRecoveryLatch(raw: unknown): AuthRecoveryLatch | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.state !== 'string' || !o.state) return null;
  if (typeof o.createdAtMs !== 'number' || !Number.isFinite(o.createdAtMs)) return null;
  if (typeof o.usedAtMs !== 'number' || !Number.isFinite(o.usedAtMs)) return null;
  if (o.phase !== 'recovering' && o.phase !== 'exhausted') return null;
  return {
    state: o.state,
    createdAtMs: o.createdAtMs,
    usedAtMs: o.usedAtMs,
    phase: o.phase,
    failedGeneration: typeof o.failedGeneration === 'string' ? o.failedGeneration : null,
    retryGeneration: typeof o.retryGeneration === 'string' ? o.retryGeneration : null,
  };
}

export function recoveryLatchInWindow(
  latch: AuthRecoveryLatch | null,
  nowMs: number,
): boolean {
  if (!latch) return false;
  return nowMs - latch.createdAtMs <= AUTH_RECOVERY_LATCH_TTL_MS;
}

/** After the one retry fails, do not remint/open Suite for this attempt. */
export function recoveryLatchBlocksRemint(
  latch: AuthRecoveryLatch | null,
  nowMs: number,
): boolean {
  return recoveryLatchInWindow(latch, nowMs) && latch?.phase === 'exhausted';
}

export type UnauthRecoveryAction =
  | 'recover'
  | 'join'
  | 'exhaust'
  | 'fail_closed'
  | 'not_unauthenticated';

/**
 * Duplicate A failures join the in-flight recovery.
 * Only session B's post-auth unauthenticated get exhausts.
 */
export function decideUnauthenticatedRecoveryAction(input: {
  exactUnauthenticated: boolean;
  latch: AuthRecoveryLatch | null;
  nowMs: number;
  usedGeneration: string | null;
}): UnauthRecoveryAction {
  if (!input.exactUnauthenticated) return 'not_unauthenticated';
  if (!recoveryLatchInWindow(input.latch, input.nowMs) || !input.latch) return 'recover';
  if (input.latch.phase === 'exhausted') return 'fail_closed';
  if (
    input.latch.retryGeneration
    && input.usedGeneration
    && input.usedGeneration === input.latch.retryGeneration
  ) {
    return 'exhaust';
  }
  return 'join';
}

export function shouldAttachRetryGeneration(input: {
  latch: AuthRecoveryLatch | null;
  expectedState: string;
  expectedCreatedAtMs: number;
}): boolean {
  if (!input.latch || input.latch.phase !== 'recovering') return false;
  if (!input.expectedState) return false;
  return input.latch.state === input.expectedState
    && input.latch.createdAtMs === input.expectedCreatedAtMs;
}

export function shouldClearRecoveryLatch(input: {
  latch: AuthRecoveryLatch | null;
  nowMs: number;
  sessionGeneration: string | null;
  attemptState?: string | null;
  attemptCreatedAtMs?: number | null;
}): boolean {
  if (!input.latch || !recoveryLatchInWindow(input.latch, input.nowMs)) return false;
  if (input.attemptState && input.latch.state !== input.attemptState) return false;
  if (
    typeof input.attemptCreatedAtMs === 'number'
    && input.latch.createdAtMs !== input.attemptCreatedAtMs
  ) {
    return false;
  }
  if (input.latch.retryGeneration && input.sessionGeneration === input.latch.retryGeneration) {
    return true;
  }
  if (
    input.attemptState
    && input.latch.state === input.attemptState
    && input.sessionGeneration
    && input.sessionGeneration !== input.latch.failedGeneration
  ) {
    return true;
  }
  return false;
}

export function createSerializedLatchMutator(io: {
  load(): Promise<AuthRecoveryLatch | null>;
  save(latch: AuthRecoveryLatch): Promise<void>;
  clear(): Promise<void>;
}) {
  const enqueue = createSerialQueue();
  return {
    save(latch: AuthRecoveryLatch) {
      return enqueue(() => io.save(latch));
    },
    attachRetryGeneration(
      expected: { state: string; createdAtMs: number },
      retryGeneration: string,
    ) {
      return enqueue(async () => {
        const current = await io.load();
        if (!shouldAttachRetryGeneration({
          latch: current,
          expectedState: expected.state,
          expectedCreatedAtMs: expected.createdAtMs,
        })) {
          return false;
        }
        await io.save({ ...current!, retryGeneration });
        return true;
      });
    },
    consumeIfMatching(input: {
      nowMs: number;
      sessionGeneration: string | null;
      attemptState?: string | null;
      attemptCreatedAtMs?: number | null;
    }) {
      return enqueue(async () => {
        const current = await io.load();
        if (!shouldClearRecoveryLatch({ latch: current, ...input })) return false;
        await io.clear();
        return true;
      });
    },
    exhaustIfMatching(expected: { state: string; createdAtMs: number }, nowMs: number) {
      return enqueue(async () => {
        const current = await io.load();
        if (
          !current
          || current.state !== expected.state
          || current.createdAtMs !== expected.createdAtMs
        ) {
          return false;
        }
        await io.save({ ...current, phase: 'exhausted', usedAtMs: nowMs });
        return true;
      });
    },
    clear() {
      return enqueue(() => io.clear());
    },
  };
}

export type UnauthRecoveryOutcome = 'recover' | 'join' | 'fail_closed';

export const UNAUTH_RECOVERY_OUTCOMES: readonly UnauthRecoveryOutcome[] = [
  'recover', 'join', 'fail_closed',
];

export function parseGovernedTerminalFailure(raw: unknown): { requestId: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const requestId = (raw as { requestId?: unknown }).requestId;
  if (typeof requestId !== 'string' || !requestId) return null;
  return { requestId };
}

export function terminalFailureMatches(
  marker: { requestId: string } | null,
  requestId: string | null,
): boolean {
  return !!marker && !!requestId && marker.requestId === requestId;
}

export function installAuthDecision(input: {
  signedInUid: string | null;
  expectedUid: string;
}): 'ok' | 'fail_closed' {
  if (!input.expectedUid || !input.signedInUid) return 'fail_closed';
  if (input.signedInUid !== input.expectedUid) return 'fail_closed';
  return 'ok';
}

export async function installGovernedAuthSession(input: {
  payload: ExchangePayloadView;
  legalName: string | null;
  generation: string;
  signInWithCustomToken(customToken: string): Promise<{ uid: string } | null>;
  persist(session: JsaGovernedSessionView): Promise<void>;
  reconcileAuth?(): Promise<void>;
  clearIfGeneration?(generation: string): Promise<void>;
}): Promise<
  | { ok: true; session: JsaGovernedSessionView }
  | { ok: false; reason: 'sign_in_failed' | 'uid_mismatch' | 'persist_failed' }
> {
  let signedIn = false;
  try {
    const cred = await input.signInWithCustomToken(input.payload.customToken);
    if (!cred || !cred.uid) return { ok: false, reason: 'sign_in_failed' };
    signedIn = true;
    if (installAuthDecision({ signedInUid: cred.uid, expectedUid: input.payload.uid }) !== 'ok') {
      await runIndependentCleanup(input.reconcileAuth, () => input.clearIfGeneration?.(input.generation));
      return { ok: false, reason: 'uid_mismatch' };
    }
    const session = sanitizeSessionForPersist(
      sessionViewFromExchange(input.payload, input.legalName, input.generation),
    );
    await input.persist(session);
    return { ok: true, session };
  } catch {
    if (signedIn) {
      await runIndependentCleanup(input.reconcileAuth, () => input.clearIfGeneration?.(input.generation));
    }
    return { ok: false, reason: 'persist_failed' };
  }
}

async function runIndependentCleanup(
  reconcileAuth?: () => Promise<void>,
  clearIfGeneration?: () => Promise<void> | undefined,
): Promise<void> {
  try {
    if (reconcileAuth) await reconcileAuth();
  } catch { /* no credential logs */ }
  try {
    if (clearIfGeneration) await clearIfGeneration();
  } catch { /* no credential logs */ }
}

export interface UnauthRecoveryDeps {
  nowMs(): number;
  loadLatch(): Promise<AuthRecoveryLatch | null>;
  saveLatch(latch: AuthRecoveryLatch): Promise<void>;
  loadAttempt(): Promise<AuthAttemptIdentity | null>;
  mintAttempt(): Promise<AuthAttemptIdentity>;
  usedGeneration: string | null;
  currentGeneration(): Promise<string | null>;
  clearIfGeneration(generation: string): Promise<void>;
  reconcileAuth(): Promise<void>;
}

let recoveryFlight: Promise<UnauthRecoveryOutcome> | null = null;

export function resetGovernedAuthRecoveryForTests(): void {
  recoveryFlight = null;
}

/**
 * One-shot recovery from an already-classified functions/unauthenticated get.
 * Concurrent callers share one flight. Duplicate A joins; only retry B exhausts.
 */
export async function beginUnauthenticatedRecovery(
  deps: UnauthRecoveryDeps,
): Promise<UnauthRecoveryOutcome> {
  if (recoveryFlight) return recoveryFlight;
  recoveryFlight = runBeginRecovery(deps).finally(() => {
    recoveryFlight = null;
  });
  return recoveryFlight;
}

async function runBeginRecovery(
  deps: UnauthRecoveryDeps,
): Promise<'recover' | 'join' | 'fail_closed'> {
  const now = deps.nowMs();
  const latch = await deps.loadLatch();
  const action = decideUnauthenticatedRecoveryAction({
    exactUnauthenticated: true,
    latch,
    nowMs: now,
    usedGeneration: deps.usedGeneration,
  });
  if (action === 'join') return 'join';
  if (action === 'fail_closed') return 'fail_closed';
  if (action === 'exhaust') {
    if (latch) {
      await deps.saveLatch({ ...latch, phase: 'exhausted', usedAtMs: now });
    }
    return 'fail_closed';
  }
  let attempt = await deps.loadAttempt();
  if (!attempt || attempt.consumed) {
    attempt = await deps.mintAttempt();
  }
  await deps.saveLatch({
    state: attempt.state,
    createdAtMs: attempt.createdAtMs,
    usedAtMs: now,
    phase: 'recovering',
    failedGeneration: deps.usedGeneration,
    retryGeneration: null,
  });
  if (deps.usedGeneration) {
    await deps.clearIfGeneration(deps.usedGeneration);
  }
  await deps.reconcileAuth();
  return 'recover';
}

export async function attachRecoveryRetryGeneration(deps: {
  loadLatch(): Promise<AuthRecoveryLatch | null>;
  saveLatch(latch: AuthRecoveryLatch): Promise<void>;
  expectedState: string;
  expectedCreatedAtMs: number;
  retryGeneration: string;
}): Promise<boolean> {
  const latch = await deps.loadLatch();
  if (!shouldAttachRetryGeneration({
    latch,
    expectedState: deps.expectedState,
    expectedCreatedAtMs: deps.expectedCreatedAtMs,
  })) {
    return false;
  }
  await deps.saveLatch({ ...latch!, retryGeneration: deps.retryGeneration });
  return true;
}

export async function consumeRecoveryLatchOnSuccess(deps: {
  nowMs(): number;
  loadLatch(): Promise<AuthRecoveryLatch | null>;
  clearLatch(): Promise<void>;
  sessionGeneration: string | null;
  attemptState?: string | null;
  attemptCreatedAtMs?: number | null;
}): Promise<boolean> {
  const latch = await deps.loadLatch();
  if (!shouldClearRecoveryLatch({
    latch,
    nowMs: deps.nowMs(),
    sessionGeneration: deps.sessionGeneration,
    attemptState: deps.attemptState ?? null,
    attemptCreatedAtMs: deps.attemptCreatedAtMs ?? null,
  })) {
    return false;
  }
  await deps.clearLatch();
  return true;
}
