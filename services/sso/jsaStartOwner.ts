/**
 * Single owner for jsaapp://start delivery.
 *
 * Expo Router /start, Linking 'url', getInitialURL, warm SINGLE_TASK,
 * cold start, and recovery all forward here. Suite authorize opens at
 * most once per request in this process. No launch secrets in logs.
 *
 * Pure I/O via injected deps — node-testable.
 */

/** Same bound as SSO_ATTEMPT_TTL_MS — kept local so this owner stays import-free. */
export const JSA_START_ATTEMPT_TTL_MS = 180_000;

export const JSA_START_PREFIX = 'jsaapp://start';

const START_KEYS = Object.freeze([
  'v', 'source', 'requestId', 'returnTo', 'jobRef', 'groupRef', 'wellName', 'jobType',
]);

export function isJsaStartUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false;
  if (url.startsWith('jsaapp://sso-callback')) return false;
  return url.startsWith(JSA_START_PREFIX) || url.startsWith('jsaapp:///start');
}

/** Expo Router sometimes yields jsaapp:///start?... — host must be `start`. */
export function normalizeJsaStartUrl(url: string): string {
  if (url.startsWith('jsaapp:///start')) {
    return `${JSA_START_PREFIX}${url.slice('jsaapp:///start'.length)}`;
  }
  return url;
}

/**
 * Rebuild a governed start URL from Expo Router search params.
 * Only protocol launch keys are copied. Identity keys are dropped.
 */
export function reconstructJsaStartUrl(
  params: Record<string, unknown>,
): string | null {
  if (!params || typeof params !== 'object') return null;
  const parts: string[] = [];
  for (const key of START_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || !value) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  if (parts.length === 0) return null;
  return `${JSA_START_PREFIX}?${parts.join('&')}`;
}

export type StartOwnershipAction = 'owned' | 'reused' | 'replaced' | 'refused';

export type StartOwnerKind =
  | 'need_auth'
  | 'ready'
  | 'fail_closed'
  | 'ignored'
  | 'duplicate';

export type StartOwnerResult = {
  kind: StartOwnerKind;
  ownership?: StartOwnershipAction;
  session?: 'present' | 'absent';
  authorize?: 'created' | 'reused' | 'not_needed';
  suiteOpen?: 'attempted' | 'succeeded' | 'failed' | 'not_attempted';
  refusal?: string;
  decision?: unknown;
  requestId?: string;
};

export type StartLogEvent =
  | 'received'
  | 'owned'
  | 'reused'
  | 'replaced'
  | 'refused'
  | 'session_present'
  | 'session_absent'
  | 'need_auth'
  | 'authorize_created'
  | 'authorize_reused'
  | 'suite_open_attempted'
  | 'suite_open_succeeded'
  | 'suite_open_failed'
  | 'get_begun'
  | 'get_outcome';

export interface JsaStartAttempt {
  consumed: boolean;
  createdAtMs: number;
}

/**
 * How this /start candidate was delivered:
 *   'live'    — a route or Linking 'url' event (a fresh delivery);
 *   'initial' — Linking.getInitialURL (legitimate on cold start, but a
 *               warm re-read replays the task's ORIGINAL intent);
 *   'stored'  — rebuilt from the persisted launch (resume paths).
 */
export type StartDeliveryProvenance = 'live' | 'initial' | 'stored';

export interface JsaStartOwnerDeps {
  nowMs(): number;
  isLegacy(url: string): boolean;
  parseLaunch(url: string): { ok: boolean; value?: { requestId: string; returnTo?: string } };
  ownLaunch(launch: { requestId: string; returnTo?: string }): Promise<'own' | 'replace' | 'duplicate'>;
  loadSession(): Promise<unknown | null>;
  loadAttempt(): Promise<JsaStartAttempt | null>;
  mintAttempt(): Promise<JsaStartAttempt>;
  openSuite(attempt: JsaStartAttempt): Promise<void>;
  /**
   * Authoritative get. `stillOwned` is a SYNCHRONOUS generation guard for
   * cheap early-outs; `commitEffect` is the generation-conditional
   * transaction (commitIfOwned bound to this run) the lifecycle MUST use
   * for every durable side effect — context persistence, recovery-latch
   * mutation, terminal mark/clear — so those writes are ordered on the
   * same serialized chain as adoption and can never settle late over a
   * successor's state.
   */
  obtain(
    stillOwned: () => boolean,
    commitEffect: (effect: () => Promise<void>) => Promise<{ applied: boolean }>,
  ): Promise<{ kind: string; refusal?: string }>;
  /** Terminal-failure mark, performed ONLY through the owner boundary. */
  markTerminal?(requestId: string): Promise<void>;
  log(event: StartLogEvent): void;
  hasOpenedFor(requestId: string): boolean;
  markOpened(requestId: string): void;
  /** Await Firebase Auth hydration before treating currentUser as absent. */
  awaitAuthReady?(): Promise<void>;
  loadRecoveryLatch?(): Promise<{ phase?: string; createdAtMs?: number } | null>;
  /** Persisted owner, for one-time arbiter hydration inside the mutex. */
  currentOwnedRequestId?(): Promise<string | null>;
  /**
   * True when this requestId is historical — a completed stored context or
   * a terminal-failure marker. A known-stale replay must never displace a
   * live launch.
   */
  isKnownStale?(requestId: string): Promise<boolean>;
}

/**
 * Single-flight PER REQUEST. Duplicate deliveries of the same requestId
 * (route + Linking + getInitialURL) join one run; a DIFFERENT requestId
 * never joins another request's run — it adopts or is refused as stale.
 */
const inFlightByRequest = new Map<string, Promise<StartOwnerResult>>();
const openedThisProcess = new Set<string>();
/** Launches replaced this process — a replay of one is stale by definition. */
const supersededThisProcess = new Set<string>();

/**
 * In-process ownership: requestId + monotone generation + whether the
 * owner was adopted by a live delivery this process. `requestId: null`
 * means NOT owned — every generation guard fails on it.
 */
interface StartOwnershipState {
  requestId: string | null;
  generation: number;
  adoptedLive: boolean;
}
let ownership: StartOwnershipState = { requestId: null, generation: 0, adoptedLive: false };
let generationCounter = 0;
let hydratedFromDisk = false;
/**
 * THE serialized arbitration boundary. Ownership read, freshness/priority
 * decision, ownership mutation, persistence, and generation assignment all
 * run on this chain — two different requests can never both read the same
 * owner and both believe they won the same generation.
 */
let arbiterChain: Promise<unknown> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
  const next = arbiterChain.then(op, op);
  arbiterChain = next.catch(() => undefined);
  return next;
}

/** Synchronous generation guard — the ONLY test for "may still act". */
export function ownsStartGeneration(requestId: string, generation: number): boolean {
  return ownership.requestId === requestId && ownership.generation === generation;
}

export type OwnedCommitOutcome = { applied: true } | { applied: false };

/**
 * Generation-conditional durable-effect transaction. Runs on the SAME
 * serialized chain as adoption, so an adoption can never interleave with
 * a pending owned effect: the exact requestId+generation is rechecked
 * inside the boundary, and the durable effect is AWAITED before the
 * arbiter is released. Not-owned → the effect never starts.
 */
export function commitIfOwned(
  requestId: string,
  generation: number,
  effect: () => Promise<void>,
): Promise<OwnedCommitOutcome> {
  return serialize(async () => {
    if (!ownsStartGeneration(requestId, generation)) return { applied: false };
    await effect();
    return { applied: true };
  });
}

/** The effect-commit signature handed to the lifecycle by the owner. */
export type OwnedEffectCommit = (effect: () => Promise<void>) => Promise<OwnedCommitOutcome>;

/**
 * SERIALIZED ownership confirmation — queued on the arbitration chain, so
 * it settles only after every already-queued adoption has published. The
 * bare sync guard can lose a microtask race against an in-flight
 * adoption; steering decisions use this instead.
 */
function confirmStartOwnership(requestId: string, generation: number): Promise<boolean> {
  return serialize(async () => ownsStartGeneration(requestId, generation));
}

/** Test/diagnostic introspection only. */
export function getStartOwnershipForTests(): { requestId: string | null; generation: number } {
  return { requestId: ownership.requestId, generation: ownership.generation };
}

export function resetJsaStartOwnerForTests(): void {
  inFlightByRequest.clear();
  openedThisProcess.clear();
  supersededThisProcess.clear();
  ownership = { requestId: null, generation: 0, adoptedLive: false };
  generationCounter = 0;
  hydratedFromDisk = false;
  arbiterChain = Promise.resolve();
}

export type StartAdoption = 'join' | 'adopt' | 'stale_replay';

/**
 * Pure adoption decision. NEVER decided by arrival order:
 * - the same requestId joins its own run/generation;
 * - a known-stale candidate is refused whatever its provenance or order;
 * - an 'initial'/'stored' replay never displaces an owner that a LIVE
 *   delivery adopted this process (warm getInitialURL re-reads the task's
 *   original intent — it is not a fresh instruction);
 * - a live delivery of a genuinely new request adopts;
 * - with no owner (cold start), any valid provenance may adopt — a cold
 *   start where getInitialURL is the only delivery still works.
 */
export function decideStartAdoption(input: {
  candidateRequestId: string;
  candidateProvenance: StartDeliveryProvenance;
  candidateKnownStale: boolean;
  ownedRequestId: string | null;
  ownedAdoptedLive: boolean;
}): StartAdoption {
  if (input.ownedRequestId === input.candidateRequestId) return 'join';
  if (input.candidateKnownStale) return 'stale_replay';
  if (!input.ownedRequestId) return 'adopt';
  if (input.candidateProvenance !== 'live' && input.ownedAdoptedLive) return 'stale_replay';
  return 'adopt';
}

interface ArbitrationOutcome {
  action: StartAdoption;
  generation: number;
}

/**
 * One atomic arbitration: hydrate (once), decide, mutate, persist, assign
 * the generation — all inside the serialized boundary.
 */
function arbitrate(
  launch: { requestId: string; returnTo?: string },
  provenance: StartDeliveryProvenance,
  deps: JsaStartOwnerDeps,
): Promise<ArbitrationOutcome & { taken?: 'own' | 'replace' | 'duplicate' }> {
  return serialize(async () => {
    if (!hydratedFromDisk) {
      hydratedFromDisk = true;
      if (ownership.requestId === null && deps.currentOwnedRequestId) {
        const persisted = await deps.currentOwnedRequestId();
        if (persisted) {
          generationCounter += 1;
          // Disk owner predates this process — no live adoption yet.
          ownership = { requestId: persisted, generation: generationCounter, adoptedLive: false };
        }
      }
    }
    const knownStale = supersededThisProcess.has(launch.requestId)
      || (deps.isKnownStale ? await deps.isKnownStale(launch.requestId) : false);
    const action = decideStartAdoption({
      candidateRequestId: launch.requestId,
      candidateProvenance: provenance,
      candidateKnownStale: knownStale,
      ownedRequestId: ownership.requestId,
      ownedAdoptedLive: ownership.adoptedLive,
    });
    if (action === 'stale_replay') {
      return { action, generation: ownership.generation };
    }
    if (action === 'join') {
      // PERSIST FIRST — publish in-memory changes only after success.
      const taken = await deps.ownLaunch(launch);
      // Same request re-delivered: refresh live standing, keep generation.
      if (provenance === 'live' && ownership.requestId === launch.requestId) {
        ownership = { ...ownership, adoptedLive: true };
      }
      return { action, generation: ownership.generation, taken };
    }
    // adopt — PERSIST FIRST: if ownLaunch throws, no in-memory field has
    // changed and the arbiter still points at the durably-written owner.
    const taken = await deps.ownLaunch(launch);
    if (ownership.requestId) supersededThisProcess.add(ownership.requestId);
    generationCounter += 1;
    ownership = {
      requestId: launch.requestId,
      generation: generationCounter,
      adoptedLive: provenance === 'live',
    };
    return { action, generation: ownership.generation, taken };
  });
}

export function processHasOpenedStart(requestId: string): boolean {
  return openedThisProcess.has(requestId);
}

export function markProcessOpenedStart(requestId: string): void {
  openedThisProcess.add(requestId);
}

export function attemptIsUsable(attempt: JsaStartAttempt | null, nowMs: number): boolean {
  if (!attempt || attempt.consumed) return false;
  return nowMs - attempt.createdAtMs <= JSA_START_ATTEMPT_TTL_MS;
}

export async function handleJsaStartUrl(
  url: unknown,
  deps: JsaStartOwnerDeps,
  // REQUIRED — no fail-open default. A getInitialURL replay silently
  // inheriting 'live' is exactly the field defect (stale initial A
  // displacing live B); every caller must declare its delivery.
  provenance: StartDeliveryProvenance,
): Promise<StartOwnerResult> {
  // Validate and parse BEFORE coalescing. Coalescing on the raw latch let
  // a different requestId silently join the wrong run (field 8/13: the
  // stale owned launch's run swallowed the fresh delivery).
  if (typeof url !== 'string' || !url || !isJsaStartUrl(url)) {
    deps.log('received');
    deps.log('refused');
    return { kind: 'ignored' };
  }
  const normalized = normalizeJsaStartUrl(url);
  if (deps.isLegacy(normalized)) {
    deps.log('received');
    deps.log('refused');
    return {
      kind: 'fail_closed',
      ownership: 'refused',
      refusal: 'malformed',
      suiteOpen: 'not_attempted',
    };
  }
  const parsed = deps.parseLaunch(normalized);
  if (!parsed.ok || !parsed.value) {
    deps.log('received');
    deps.log('refused');
    return {
      kind: 'fail_closed',
      ownership: 'refused',
      refusal: 'malformed',
      suiteOpen: 'not_attempted',
    };
  }
  const launch = parsed.value;
  const joined = inFlightByRequest.get(launch.requestId);
  if (joined) {
    // A live delivery joining an in-flight same-id run must still promote
    // live standing — otherwise an initial-provenance owner stays
    // displaceable while its live join is swallowed. Serialized, and only
    // while that exact request still owns.
    if (provenance === 'live') {
      void serialize(async () => {
        if (ownership.requestId === launch.requestId) {
          ownership = { ...ownership, adoptedLive: true };
        }
      });
    }
    return joined;
  }
  const run = runStart(launch, provenance, deps).finally(() => {
    inFlightByRequest.delete(launch.requestId);
  });
  inFlightByRequest.set(launch.requestId, run);
  return run;
}

function mapOwn(action: 'own' | 'replace' | 'duplicate'): StartOwnershipAction {
  if (action === 'own') return 'owned';
  if (action === 'replace') return 'replaced';
  return 'reused';
}

function supersededResult(requestId: string): StartOwnerResult {
  return {
    kind: 'ignored',
    ownership: 'refused',
    refusal: 'superseded',
    requestId,
  };
}

async function runStart(
  launch: { requestId: string; returnTo?: string },
  provenance: StartDeliveryProvenance,
  deps: JsaStartOwnerDeps,
): Promise<StartOwnerResult> {
  if (deps.awaitAuthReady) await deps.awaitAuthReady();
  deps.log('received');
  const requestId = launch.requestId;

  // ONE atomic arbitration: read, decide, mutate, persist, generation.
  const arb = await arbitrate(launch, provenance, deps);
  if (arb.action === 'stale_replay') {
    deps.log('refused');
    return {
      kind: 'ignored',
      ownership: 'refused',
      refusal: 'stale_replay',
      requestId,
    };
  }
  const generation = arb.generation;
  const stillOwned = () => ownsStartGeneration(requestId, generation);
  const taken = arb.taken ?? 'own';
  deps.log(taken === 'duplicate' ? 'reused' : taken === 'replace' ? 'replaced' : 'owned');

  const session = await deps.loadSession();
  deps.log(session ? 'session_present' : 'session_absent');

  if (session) {
    // SERIALIZED confirmation BEFORE the network read: settles after any
    // queued adoption, so a run that already lost never fetches.
    if (!(await confirmStartOwnership(requestId, generation))) {
      return supersededResult(requestId);
    }
    deps.log('get_begun');
    const obtained = await deps.obtain(
      stillOwned,
      (effect) => commitIfOwned(requestId, generation, effect),
    );
    deps.log('get_outcome');
    // Serialized again at settle — a successor that adopted while the get
    // was in flight suppresses this run's steering.
    if (!(await confirmStartOwnership(requestId, generation))) {
      return supersededResult(requestId);
    }
    if (obtained.kind === 'fail_closed') {
      return {
        kind: 'fail_closed',
        ownership: mapOwn(taken),
        session: 'present',
        authorize: 'not_needed',
        suiteOpen: 'not_attempted',
        refusal: obtained.refusal || 'malformed',
        decision: obtained,
        requestId,
      };
    }
    if (obtained.kind === 'need_auth') {
      return authorize(deps, requestId, generation, mapOwn(taken));
    }
    return {
      kind: 'ready',
      ownership: mapOwn(taken),
      session: 'present',
      authorize: 'not_needed',
      suiteOpen: 'not_attempted',
      decision: obtained,
    };
  }

  deps.log('need_auth');
  return authorize(deps, requestId, generation, mapOwn(taken));
}

async function authorize(
  deps: JsaStartOwnerDeps,
  requestId: string,
  generation: number,
  ownership: StartOwnershipAction,
): Promise<StartOwnerResult> {
  if (!(await confirmStartOwnership(requestId, generation))) {
    return supersededResult(requestId);
  }
  const now = deps.nowMs();
  if (deps.loadRecoveryLatch) {
    const latch = await deps.loadRecoveryLatch();
    if (
      latch
      && latch.phase === 'exhausted'
      && typeof latch.createdAtMs === 'number'
      && now - latch.createdAtMs <= JSA_START_ATTEMPT_TTL_MS
    ) {
      // Terminal mark through the owner boundary only — a superseded run
      // can never overwrite the successor's stored terminal marker.
      if (deps.markTerminal) {
        await commitIfOwned(requestId, generation, () => deps.markTerminal!(requestId));
      }
      return {
        kind: 'fail_closed',
        ownership,
        session: 'absent',
        authorize: 'not_needed',
        suiteOpen: 'not_attempted',
        refusal: 'unauthenticated',
        requestId,
      };
    }
  }
  const existing = await deps.loadAttempt();
  const already = deps.hasOpenedFor(requestId);
  const usable = attemptIsUsable(existing, now);

  if (usable && already) {
    deps.log('authorize_reused');
    return {
      kind: 'duplicate',
      ownership,
      session: 'absent',
      authorize: 'reused',
      suiteOpen: 'not_attempted',
    };
  }

  let attempt = existing;
  let authorizeKind: 'created' | 'reused' = 'reused';
  if (!usable) {
    attempt = await deps.mintAttempt();
    authorizeKind = 'created';
    deps.log('authorize_created');
  } else {
    deps.log('authorize_reused');
  }

  // SERIALIZED confirmation immediately before the outward Suite open — a
  // superseded run must not authorize on behalf of its successor, even
  // when the successor's adoption is still publishing.
  if (!(await confirmStartOwnership(requestId, generation))) {
    return supersededResult(requestId);
  }
  deps.log('suite_open_attempted');
  try {
    await deps.openSuite(attempt as JsaStartAttempt);
    deps.markOpened(requestId);
    deps.log('suite_open_succeeded');
    return {
      kind: 'need_auth',
      ownership,
      session: 'absent',
      authorize: authorizeKind,
      suiteOpen: 'succeeded',
    };
  } catch {
    deps.log('suite_open_failed');
    return {
      kind: 'need_auth',
      ownership,
      session: 'absent',
      authorize: authorizeKind,
      suiteOpen: 'failed',
    };
  }
}
