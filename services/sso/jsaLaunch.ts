/**
 * Governed WB-T -> WB-JSA launch and return contract (held 0.5.0-dev).
 *
 * Launch metadata is untrusted context only. Identity, company, shift,
 * and policy come from the authenticated exchange. Return carries status
 * only — no receipt content.
 *
 * Pure and node-testable.
 */

const SSO_FORBIDDEN = [
  'idToken', 'id_token', 'refreshToken', 'refresh_token',
  'customToken', 'custom_token', 'accessToken', 'access_token',
  'passcode', 'password', 'hash', 'driverHash', 'passcodeHash',
  'codeVerifier', 'code_verifier', 'verifier',
];

function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function containsForbiddenSsoField(input: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  const o = rec(input);
  if (!o) return false;
  const forbidden = SSO_FORBIDDEN.map((k) => k.toLowerCase());
  for (const key of Object.keys(o)) {
    if (forbidden.includes(key.toLowerCase())) return true;
    if (containsForbiddenSsoField(o[key], depth + 1)) return true;
  }
  return false;
}

export const JSA_LAUNCH_VERSION = 1 as const;
export const JSA_LAUNCH_SCHEME = 'jsaapp' as const;
export const JSA_LAUNCH_HOST = 'start' as const;
export const JSA_RETURN_SCHEME = 'wellbuilt-tickets' as const;
export const JSA_RETURN_HOST = 'jsa-return' as const;
export const JSA_HINT_MAX = 120;
export const JSA_REF_MAX = 128;

export function isJsaRequestId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
}

function isBoundedHint(v: unknown): v is string {
  return typeof v === 'string'
    && v.length > 0
    && v.length <= JSA_HINT_MAX
    && !/[\u0000-\u001F\u007F]/.test(v);
}

function isBoundedRef(v: unknown): v is string {
  return typeof v === 'string'
    && v.length > 0
    && v.length <= JSA_REF_MAX
    && /^[A-Za-z0-9._-]+$/.test(v);
}

export type JsaReturnTarget = 'wbt' | 'none';

export interface JsaLaunchRequest {
  v: number;
  source: 'wbt';
  requestId: string;
  returnTo: JsaReturnTarget;
  jobRef?: string;
  groupRef?: string;
  wellName?: string;
  jobType?: string;
}

export const JSA_RETURN_STATUSES = Object.freeze([
  'read',
  'acknowledged',
  'declined',
  'error',
] as const);
export type JsaReturnStatus = (typeof JSA_RETURN_STATUSES)[number];

export function isJsaReturnStatus(v: unknown): v is JsaReturnStatus {
  return typeof v === 'string' && (JSA_RETURN_STATUSES as readonly string[]).includes(v);
}

export interface JsaReturnMessage {
  v: number;
  requestId: string;
  status: JsaReturnStatus;
}

export const JSA_FORBIDDEN_LAUNCH_KEYS: readonly string[] = Object.freeze([
  'name', 'displayName', 'driverId', 'companyId', 'shiftId',
  'code', 'state', 'codeChallenge', 'cc',
]);

function containsJsaForbiddenField(o: Record<string, unknown>): boolean {
  if (containsForbiddenSsoField(o)) return true;
  const forbidden = JSA_FORBIDDEN_LAUNCH_KEYS.map((k) => k.toLowerCase());
  return Object.keys(o).some((k) => forbidden.includes(k.toLowerCase()));
}

export type JsaLaunchValidation<T> =
  | { ok: true; value: T }
  | { ok: false; field: string };

const LAUNCH_KEYS: readonly string[] = Object.freeze([
  'v', 'source', 'requestId', 'returnTo', 'jobRef', 'groupRef', 'wellName', 'jobType',
]);
const RETURN_KEYS: readonly string[] = Object.freeze(['v', 'requestId', 'status']);

export function validateJsaLaunchRequest(input: unknown): JsaLaunchValidation<JsaLaunchRequest> {
  const o = rec(input);
  if (!o) return { ok: false, field: '<root>' };
  if (containsJsaForbiddenField(o)) return { ok: false, field: '<forbidden>' };
  if (!Object.keys(o).every((k) => LAUNCH_KEYS.includes(k))) {
    return { ok: false, field: '<unknown-key>' };
  }
  if (o.v !== JSA_LAUNCH_VERSION) return { ok: false, field: 'v' };
  if (o.source !== 'wbt') return { ok: false, field: 'source' };
  if (!isJsaRequestId(o.requestId)) return { ok: false, field: 'requestId' };
  if (o.returnTo !== 'wbt' && o.returnTo !== 'none') return { ok: false, field: 'returnTo' };
  if (o.wellName !== undefined && !isBoundedHint(o.wellName)) return { ok: false, field: 'wellName' };
  if (o.jobType !== undefined && !isBoundedHint(o.jobType)) return { ok: false, field: 'jobType' };
  if (o.jobRef !== undefined && !isBoundedRef(o.jobRef)) return { ok: false, field: 'jobRef' };
  if (o.groupRef !== undefined && !isBoundedRef(o.groupRef)) return { ok: false, field: 'groupRef' };
  return {
    ok: true,
    value: {
      v: JSA_LAUNCH_VERSION,
      source: 'wbt',
      requestId: o.requestId as string,
      returnTo: o.returnTo as JsaReturnTarget,
      ...(o.jobRef !== undefined ? { jobRef: o.jobRef as string } : {}),
      ...(o.groupRef !== undefined ? { groupRef: o.groupRef as string } : {}),
      ...(o.wellName !== undefined ? { wellName: o.wellName as string } : {}),
      ...(o.jobType !== undefined ? { jobType: o.jobType as string } : {}),
    },
  };
}

export function validateJsaReturnMessage(input: unknown): JsaLaunchValidation<JsaReturnMessage> {
  const o = rec(input);
  if (!o) return { ok: false, field: '<root>' };
  if (containsJsaForbiddenField(o)) return { ok: false, field: '<forbidden>' };
  if (!Object.keys(o).every((k) => RETURN_KEYS.includes(k))) {
    return { ok: false, field: '<unknown-key>' };
  }
  if (o.v !== JSA_LAUNCH_VERSION) return { ok: false, field: 'v' };
  if (!isJsaRequestId(o.requestId)) return { ok: false, field: 'requestId' };
  if (!isJsaReturnStatus(o.status)) return { ok: false, field: 'status' };
  return {
    ok: true,
    value: { v: JSA_LAUNCH_VERSION, requestId: o.requestId as string, status: o.status },
  };
}

function enc(v: string): string {
  return encodeURIComponent(v);
}

export function buildJsaLaunchUrl(request: JsaLaunchRequest): string {
  const parts = [
    `v=${enc(String(request.v))}`,
    `source=${enc(request.source)}`,
    `requestId=${enc(request.requestId)}`,
    `returnTo=${enc(request.returnTo)}`,
  ];
  if (request.jobRef !== undefined) parts.push(`jobRef=${enc(request.jobRef)}`);
  if (request.groupRef !== undefined) parts.push(`groupRef=${enc(request.groupRef)}`);
  if (request.wellName !== undefined) parts.push(`wellName=${enc(request.wellName)}`);
  if (request.jobType !== undefined) parts.push(`jobType=${enc(request.jobType)}`);
  return `${JSA_LAUNCH_SCHEME}://${JSA_LAUNCH_HOST}?${parts.join('&')}`;
}

export function buildJsaReturnUrl(message: JsaReturnMessage): string {
  const q = [
    `v=${enc(String(message.v))}`,
    `requestId=${enc(message.requestId)}`,
    `status=${enc(message.status)}`,
  ].join('&');
  return `${JSA_RETURN_SCHEME}://${JSA_RETURN_HOST}?${q}`;
}

function splitDeepLink(
  url: unknown,
  scheme: string,
  host: string,
): Record<string, string> | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  const prefix = `${scheme}://`;
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  const qAt = rest.indexOf('?');
  const hostPart = qAt < 0 ? rest : rest.slice(0, qAt);
  if (hostPart !== host) return null;
  if (qAt < 0) return {};
  const query = rest.slice(qAt + 1);
  if (query.includes('#')) return null;
  const out: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) return null;
    const k = pair.slice(0, eq);
    let v: string;
    try {
      v = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      return null;
    }
    if (Object.prototype.hasOwnProperty.call(out, k)) return null;
    out[k] = v;
  }
  return out;
}

export function parseJsaLaunchUrl(url: unknown): JsaLaunchValidation<JsaLaunchRequest> {
  const q = splitDeepLink(url, JSA_LAUNCH_SCHEME, JSA_LAUNCH_HOST);
  if (!q) return { ok: false, field: '<url>' };
  const version = Number(q.v);
  return validateJsaLaunchRequest({
    ...q,
    v: Number.isFinite(version) ? version : q.v,
  });
}

export function parseJsaReturnUrl(url: unknown): JsaLaunchValidation<JsaReturnMessage> {
  const q = splitDeepLink(url, JSA_RETURN_SCHEME, JSA_RETURN_HOST);
  if (!q) return { ok: false, field: '<url>' };
  const version = Number(q.v);
  return validateJsaReturnMessage({
    ...q,
    v: Number.isFinite(version) ? version : q.v,
  });
}

/** Durable owner of an untrusted launch request. Never authority. */
export const JSA_LAUNCH_CONTEXT_KEY = '@jsa/governedLaunchContext';

export function isLegacyJsaLaunchUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  if (!url.startsWith(`${JSA_LAUNCH_SCHEME}://${JSA_LAUNCH_HOST}`)) return false;
  return /(?:^|[?&])(hash|name|shiftId|driverId|companyId)=/i.test(url);
}
