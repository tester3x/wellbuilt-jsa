/** Standalone access and required-work requests are separate authorities.
 * Permission values must come from a current server-authorized company session,
 * never from local settings, return URLs, shift hints, or company display names.
 */
export type JsaAccessDecision =
  | { kind: 'denied'; reason: 'authentication' | 'company_permission' | 'required_request' }
  | { kind: 'standalone'; companyId: string; driverId: string; shiftId: null }
  | { kind: 'required'; companyId: string; driverId: string; shiftId: string; requestId: string };

export function decideJsaCreationAccess(input: {
  authenticated: boolean;
  companyId: string | null;
  driverId: string | null;
  companyJsaAllowed: boolean;
  requiredLaunchPresent: boolean;
  request: { requestId: string; companyId: string; driverId: string; shiftId: string; verified: boolean } | null;
}): JsaAccessDecision {
  if (!input.authenticated || !input.driverId) return { kind: 'denied', reason: 'authentication' };
  if (!input.companyId || !input.companyJsaAllowed) return { kind: 'denied', reason: 'company_permission' };
  if (input.requiredLaunchPresent) {
    const r = input.request;
    if (!r?.verified || !r.requestId || !r.shiftId || r.companyId !== input.companyId || r.driverId !== input.driverId) {
      return { kind: 'denied', reason: 'required_request' };
    }
    return { kind: 'required', companyId: input.companyId, driverId: input.driverId, shiftId: r.shiftId, requestId: r.requestId };
  }
  // A cached active shift or stale request must not silently bind independent work.
  return { kind: 'standalone', companyId: input.companyId, driverId: input.driverId, shiftId: null };
}
