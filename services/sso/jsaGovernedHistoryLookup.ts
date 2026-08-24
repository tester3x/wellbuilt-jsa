import type { JsaGovernedSession } from './jsaSession';

export type GovernedHistoryLookupResult<T> =
  | { kind: 'found'; record: T }
  | { kind: 'backend_required'; reason: 'pre_cutover_completeness_unavailable' }
  | { kind: 'unavailable'; reason: 'identity' | 'token' | 'denied' | 'network' | 'malformed' | 'index' };

export interface GovernedHistoryTransport {
  inspectIdentity(): Promise<{ state: string; session: JsaGovernedSession | null; firebaseUid: string | null }>;
  freshIdToken(expectedUid: string): Promise<string>;
  runQuery(input: { token: string; driverId: string; companyId: string; shiftId: string }): Promise<unknown>;
}

function refusal(error: unknown): GovernedHistoryLookupResult<never> {
  const status = (error as { status?: unknown } | null)?.status;
  const message = String((error as { message?: unknown } | null)?.message ?? '').toLowerCase();
  if (status === 401 || status === 403) return { kind: 'unavailable', reason: 'denied' };
  if (status === 412 || message.includes('index')) return { kind: 'unavailable', reason: 'index' };
  if (message.includes('token') || message.includes('auth')) return { kind: 'unavailable', reason: 'token' };
  return { kind: 'unavailable', reason: 'network' };
}

export async function lookupGovernedShiftHistory<T = unknown>(
  shiftId: string,
  transport: GovernedHistoryTransport,
): Promise<GovernedHistoryLookupResult<T>> {
  if (!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(shiftId)) return { kind: 'unavailable', reason: 'identity' };
  const inspected = await transport.inspectIdentity();
  const session = inspected.session;
  if (inspected.state !== 'usable' || !session || inspected.firebaseUid !== session.uid) {
    return { kind: 'unavailable', reason: 'identity' };
  }
  try {
    const token = await transport.freshIdToken(session.uid);
    if (!token) return { kind: 'unavailable', reason: 'token' };
    const raw = await transport.runQuery({
      token, driverId: session.driverId, companyId: session.companyId, shiftId,
    });
    if (!Array.isArray(raw)) return { kind: 'unavailable', reason: 'malformed' };
    const documents = raw.filter((entry) => !!(entry as { document?: unknown } | null)?.document);
    for (const entry of documents) {
      const fields = (entry as any)?.document?.fields;
      if (!fields || typeof fields !== 'object') return { kind: 'unavailable', reason: 'malformed' };
      const driverId = fields.driverId?.stringValue;
      const companyId = fields.companyId?.stringValue;
      const recordShiftId = fields.shiftId?.stringValue;
      if (!driverId || !companyId) {
        return { kind: 'backend_required', reason: 'pre_cutover_completeness_unavailable' };
      }
      if (driverId !== session.driverId || companyId !== session.companyId || recordShiftId !== shiftId) {
        return { kind: 'unavailable', reason: 'malformed' };
      }
      return { kind: 'found', record: entry as T };
    }
    return { kind: 'backend_required', reason: 'pre_cutover_completeness_unavailable' };
  } catch (error) {
    return refusal(error);
  }
}
