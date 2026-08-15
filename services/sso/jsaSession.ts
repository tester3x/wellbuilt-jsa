/**
 * Exchange result + secure session. displayName is a session label only.
 * legalName is hydrated separately and never substituted from displayName.
 */
import { isJsaBinding, type JsaBinding } from './jsaBinding';
import {
  resolveGovernedLegalName,
  sanitizeSessionForPersist,
  validatePersistedGovernedSession,
} from './jsaGovernedAuth';

export {
  resolveGovernedLegalName,
  sanitizeSessionForPersist,
  validatePersistedGovernedSession,
};

export interface JsaGovernedSession {
  uid: string;
  driverId: string;
  companyId: string;
  displayName: string | null;
  legalName: string | null;
  binding: JsaBinding;
  /** Local identity so a late failure can clear only the generation it used. */
  generation: string;
}

export interface ExchangePayload {
  protocolVersion: number;
  customToken: string;
  uid: string;
  driverId: string;
  companyId: string;
  displayName?: string;
  /** Optional. Authenticated exchange legalName, already resolved. */
  legalName?: string;
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
  const displayName = typeof o.displayName === 'string' ? o.displayName : undefined;
  const legalName = resolveGovernedLegalName(o.legalName, displayName);
  return {
    protocolVersion: 1,
    customToken: o.customToken,
    uid: o.uid,
    driverId: o.driverId,
    companyId: o.companyId,
    displayName,
    ...(legalName ? { legalName } : {}),
    jsaBinding: o.jsaBinding,
  };
}

export function sessionFromExchange(
  payload: ExchangePayload,
  legalName: string | null,
  generation: string,
): JsaGovernedSession {
  return {
    uid: payload.uid,
    driverId: payload.driverId,
    companyId: payload.companyId,
    displayName: payload.displayName ?? null,
    legalName: resolveGovernedLegalName(
      legalName ?? payload.legalName,
      payload.displayName,
    ),
    binding: payload.jsaBinding!,
    generation,
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
