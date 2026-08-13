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

export interface JsaStartOwnerDeps {
  nowMs(): number;
  isLegacy(url: string): boolean;
  parseLaunch(url: string): { ok: boolean; value?: { requestId: string; returnTo?: string } };
  ownLaunch(launch: { requestId: string; returnTo?: string }): Promise<'own' | 'replace' | 'duplicate'>;
  loadSession(): Promise<unknown | null>;
  loadAttempt(): Promise<JsaStartAttempt | null>;
  mintAttempt(): Promise<JsaStartAttempt>;
  openSuite(attempt: JsaStartAttempt): Promise<void>;
  obtain(): Promise<{ kind: string; refusal?: string }>;
  log(event: StartLogEvent): void;
  hasOpenedFor(requestId: string): boolean;
  markOpened(requestId: string): void;
}

let inFlight: Promise<StartOwnerResult> | null = null;
const openedThisProcess = new Set<string>();

export function resetJsaStartOwnerForTests(): void {
  inFlight = null;
  openedThisProcess.clear();
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
): Promise<StartOwnerResult> {
  if (inFlight) return inFlight;
  inFlight = runStart(url, deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function mapOwn(action: 'own' | 'replace' | 'duplicate'): StartOwnershipAction {
  if (action === 'own') return 'owned';
  if (action === 'replace') return 'replaced';
  return 'reused';
}

async function runStart(
  url: unknown,
  deps: JsaStartOwnerDeps,
): Promise<StartOwnerResult> {
  deps.log('received');
  if (typeof url !== 'string' || !url) {
    deps.log('refused');
    return { kind: 'ignored' };
  }
  if (!isJsaStartUrl(url)) {
    deps.log('refused');
    return { kind: 'ignored' };
  }
  const normalized = normalizeJsaStartUrl(url);
  if (deps.isLegacy(normalized)) {
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
    deps.log('refused');
    return {
      kind: 'fail_closed',
      ownership: 'refused',
      refusal: 'malformed',
      suiteOpen: 'not_attempted',
    };
  }
  const launch = parsed.value;
  const taken = await deps.ownLaunch(launch);
  deps.log(taken === 'duplicate' ? 'reused' : taken === 'replace' ? 'replaced' : 'owned');

  const session = await deps.loadSession();
  deps.log(session ? 'session_present' : 'session_absent');

  if (session) {
    deps.log('get_begun');
    const obtained = await deps.obtain();
    deps.log('get_outcome');
    if (obtained.kind === 'fail_closed') {
      return {
        kind: 'fail_closed',
        ownership: mapOwn(taken),
        session: 'present',
        authorize: 'not_needed',
        suiteOpen: 'not_attempted',
        refusal: obtained.refusal || 'malformed',
        decision: obtained,
      };
    }
    if (obtained.kind === 'need_auth') {
      return authorize(deps, launch.requestId, mapOwn(taken));
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
  return authorize(deps, launch.requestId, mapOwn(taken));
}

async function authorize(
  deps: JsaStartOwnerDeps,
  requestId: string,
  ownership: StartOwnershipAction,
): Promise<StartOwnerResult> {
  const now = deps.nowMs();
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
