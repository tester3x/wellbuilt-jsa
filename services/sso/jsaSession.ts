/**
 * Exchange result + secure session. displayName is a session label only.
 * legalName is hydrated separately and never substituted from displayName.
 */
import { isJsaBinding, type JsaBinding } from './jsaBinding';

export interface JsaGovernedSession {
  uid: string;
  driverId: string;
  companyId: string;
  displayName: string | null;
  legalName: string | null;
  binding: JsaBinding;
}

export interface ExchangePayload {
  protocolVersion: number;
  customToken: string;
  uid: string;
  driverId: string;
  companyId: string;
  displayName?: string;
  jsaBinding?: JsaBinding;
}

export function validateExchangePayload(raw: unknown): ExchangePayload | null {
  const o = raw as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  if (o.protocolVersion !== 1) return null;
  if (typeof o.customToken !== 'string' || !o.customToken) return null;
  if (typeof o.uid !== 'string' || !o.uid) return null;
  if (typeof o.driverId !== 'string' || !o.driverId) return null;
  if (typeof o.companyId !== 'string' || !o.companyId) return null;
  if (!isJsaBinding(o.jsaBinding)) return null;
  return {
    protocolVersion: 1,
    customToken: o.customToken,
    uid: o.uid,
    driverId: o.driverId,
    companyId: o.companyId,
    displayName: typeof o.displayName === 'string' ? o.displayName : undefined,
    jsaBinding: o.jsaBinding,
  };
}

export function sessionFromExchange(
  payload: ExchangePayload,
  legalName: string | null,
): JsaGovernedSession {
  return {
    uid: payload.uid,
    driverId: payload.driverId,
    companyId: payload.companyId,
    displayName: payload.displayName ?? null,
    legalName: legalName && legalName.trim() ? legalName.trim() : null,
    binding: payload.jsaBinding!,
  };
}

export function bindCheckProfile(input: {
  session: JsaGovernedSession;
  profileDriverId?: string | null;
  profileCompanyId?: string | null;
}): boolean {
  if (input.profileDriverId && input.profileDriverId !== input.session.driverId) return false;
  if (input.profileCompanyId && input.profileCompanyId !== input.session.companyId) return false;
  return true;
}

/** Signature/ack default: legalName only. Never displayName/username. */
export function legalAcknowledgmentName(session: JsaGovernedSession | null): string {
  const n = session?.legalName?.trim();
  return n || '';
}
