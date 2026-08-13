/**
 * PKCE S256 attempt for Suite authorize -> jsaapp://sso-callback.
 * Verifier never enters a URL. State is echoed; replay is refused.
 */
export const SSO_AUDIENCE_JSA = 'wellbuilt-jsa' as const;
export const SSO_AUTHORIZE_URL_PREFIX = 'wellbuilt-suite://sso-authorize';
export const SSO_CALLBACK_PREFIX = 'jsaapp://sso-callback';
export const SSO_ATTEMPT_TTL_MS = 180_000;

export interface JsaPkceAttempt {
  state: string;
  verifier: string;
  challenge: string;
  createdAtMs: number;
  consumed: boolean;
}

export type CallbackParse =
  | { ok: true; status: 'success'; code: string; state: string }
  | { ok: true; status: 'error'; errorCode: string; state?: string }
  | { ok: false; reason: 'malformed' | 'replay' | 'state_mismatch' | 'expired' | 'consumed' };

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeB64Url32(bytes: ArrayLike<number>): string {
  if (!bytes || bytes.length !== 32) throw new Error('need 32 bytes');
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] & 0xff;
    const b1 = i + 1 < bytes.length ? bytes[i + 1] & 0xff : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] & 0xff : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64[b2 & 63];
  }
  return out;
}

export function constantTimeEquals(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function buildAuthorizeUrl(attempt: JsaPkceAttempt): string {
  const enc = encodeURIComponent;
  return `${SSO_AUTHORIZE_URL_PREFIX}?v=1&aud=${enc(SSO_AUDIENCE_JSA)}&cc=${enc(attempt.challenge)}&ccm=S256&state=${enc(attempt.state)}`;
}

export function parseJsaSsoCallbackUrl(url: unknown): CallbackParse {
  if (typeof url !== 'string' || !url.startsWith(SSO_CALLBACK_PREFIX)) {
    return { ok: false, reason: 'malformed' };
  }
  const qAt = url.indexOf('?');
  if (qAt < 0) return { ok: false, reason: 'malformed' };
  const q: Record<string, string> = {};
  for (const pair of url.slice(qAt + 1).split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) return { ok: false, reason: 'malformed' };
    const k = pair.slice(0, eq);
    if (Object.prototype.hasOwnProperty.call(q, k)) return { ok: false, reason: 'malformed' };
    try { q[k] = decodeURIComponent(pair.slice(eq + 1)); } catch { return { ok: false, reason: 'malformed' }; }
  }
  if (q.status === 'success' && q.code && q.state) {
    return { ok: true, status: 'success', code: q.code, state: q.state };
  }
  if (q.status === 'error' && q.err) {
    return { ok: true, status: 'error', errorCode: q.err, state: q.state };
  }
  return { ok: false, reason: 'malformed' };
}

export function consumeCallback(
  attempt: JsaPkceAttempt | null,
  parsed: CallbackParse,
  nowMs: number,
): CallbackParse | { ok: true; status: 'success'; code: string; verifier: string } {
  if (!parsed.ok) return parsed;
  if (!attempt) return { ok: false, reason: 'malformed' };
  if (attempt.consumed) return { ok: false, reason: 'consumed' };
  if (nowMs - attempt.createdAtMs > SSO_ATTEMPT_TTL_MS) return { ok: false, reason: 'expired' };
  if (parsed.status === 'error') {
    if (parsed.state && !constantTimeEquals(parsed.state, attempt.state)) {
      return { ok: false, reason: 'state_mismatch' };
    }
    return parsed;
  }
  if (!constantTimeEquals(parsed.state, attempt.state)) {
    return { ok: false, reason: 'state_mismatch' };
  }
  return { ok: true, status: 'success', code: parsed.code, verifier: attempt.verifier };
}

export function markConsumed(attempt: JsaPkceAttempt): JsaPkceAttempt {
  return { ...attempt, consumed: true };
}
