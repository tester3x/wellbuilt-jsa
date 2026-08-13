/**
 * Single owner for jsaapp://sso-callback delivery.
 *
 * Expo Router, Linking 'url', and getInitialURL all forward here.
 * Exchange runs at most once (in-flight + consumed attempt).
 * No callback secrets in logs.
 *
 * Pure I/O via injected deps — node-testable.
 */

export const JSA_SSO_CALLBACK_PREFIX = 'jsaapp://sso-callback';

const CALLBACK_KEYS = Object.freeze(['v', 'status', 'code', 'state', 'err']);

export function isJsaSsoCallbackUrl(url: unknown): boolean {
  return typeof url === 'string' && url.startsWith(JSA_SSO_CALLBACK_PREFIX);
}

/**
 * Rebuild the canonical callback URL from Expo Router search params.
 * Only the protocol keys are copied. Extra/identity keys are dropped.
 */
export function reconstructJsaCallbackUrl(
  params: Record<string, unknown>,
): string | null {
  if (!params || typeof params !== 'object') return null;
  const parts: string[] = [];
  for (const key of CALLBACK_KEYS) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string' || !value) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  if (parts.length === 0) return null;
  return `${JSA_SSO_CALLBACK_PREFIX}?${parts.join('&')}`;
}

export type CallbackOwnerKind =
  | 'exchanged'
  | 'duplicate'
  | 'fail_closed'
  | 'ignored';

export type CallbackOwnerResult = {
  kind: CallbackOwnerKind;
  refusal?: string;
  alreadyExchanged?: boolean;
};

export interface JsaCallbackOwnerDeps {
  nowMs(): number;
  parseUrl(url: unknown): { ok: boolean; status?: string; code?: string; state?: string; reason?: string };
  loadAttempt(): Promise<{ consumed: boolean; state: string; verifier: string; createdAtMs: number } | null>;
  consume(
    attempt: { consumed: boolean; state: string; verifier: string; createdAtMs: number } | null,
    parsed: { ok: boolean; status?: string; code?: string; state?: string; reason?: string },
    nowMs: number,
  ): { ok: boolean; status?: string; code?: string; verifier?: string; reason?: string };
  markConsumed<T extends { consumed: boolean }>(attempt: T): T;
  saveAttempt(attempt: { consumed: boolean; state: string; verifier: string; createdAtMs: number }): Promise<void>;
  clearAttempt(): Promise<void>;
  exchange(input: { code: string; verifier: string }): Promise<unknown | null>;
  saveSession(payload: unknown): Promise<void>;
  loadSession(): Promise<unknown | null>;
  obtainAfterSession(): Promise<void>;
}

let inFlight: Promise<CallbackOwnerResult> | null = null;

export function resetJsaCallbackOwnerForTests(): void {
  inFlight = null;
}

export async function handleJsaSsoCallbackUrl(
  url: unknown,
  deps: JsaCallbackOwnerDeps,
): Promise<CallbackOwnerResult> {
  if (!isJsaSsoCallbackUrl(url)) return { kind: 'ignored' };
  if (inFlight) return inFlight;
  inFlight = runCallback(url as string, deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runCallback(
  url: string,
  deps: JsaCallbackOwnerDeps,
): Promise<CallbackOwnerResult> {
  const parsed = deps.parseUrl(url);
  const attempt = await deps.loadAttempt();
  if (attempt?.consumed) {
    const session = await deps.loadSession();
    if (session) {
      await deps.obtainAfterSession();
      return { kind: 'duplicate', alreadyExchanged: true };
    }
    return { kind: 'fail_closed', refusal: 'malformed' };
  }
  const consumed = deps.consume(attempt, parsed, deps.nowMs());
  if (!consumed.ok || consumed.status !== 'success' || !consumed.code || !consumed.verifier) {
    return { kind: 'fail_closed', refusal: consumed.reason || 'malformed' };
  }
  if (attempt) await deps.saveAttempt(deps.markConsumed(attempt));
  const payload = await deps.exchange({ code: consumed.code, verifier: consumed.verifier });
  if (!payload) {
    await deps.clearAttempt();
    return { kind: 'fail_closed', refusal: 'unauthenticated' };
  }
  await deps.saveSession(payload);
  await deps.clearAttempt();
  await deps.obtainAfterSession();
  return { kind: 'exchanged' };
}
