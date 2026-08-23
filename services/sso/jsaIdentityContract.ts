export interface JsaCanonicalProfile {
  driverId: string; displayName: string; legalName: string | null; companyId: string;
  companyName: string | null; truckNumber: string | null; trailerNumber: string | null;
  signature: string | null; phone: string | null; cdl: string | null;
  assignedCustomers: unknown[]; assignedRoutes: unknown[] | null; logoutAt: number | null;
}
function rec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function str(v: unknown): string | null { return typeof v === 'string' && v.trim() ? v : null; }
export function parseCanonicalProfile(raw: unknown, expected: { driverId: string; companyId: string }): JsaCanonicalProfile | null {
  const o = rec(raw);
  if (!o || o.driverId !== expected.driverId || o.companyId !== expected.companyId) return null;
  return {
    driverId: expected.driverId, displayName: str(o.displayName) || '', legalName: str(o.legalName),
    companyId: expected.companyId, companyName: str(o.companyName), truckNumber: str(o.truckNumber),
    trailerNumber: str(o.trailerNumber), signature: str(o.signature), phone: str(o.phone), cdl: str(o.cdl),
    assignedCustomers: Array.isArray(o.assignedCustomers) ? o.assignedCustomers : [],
    assignedRoutes: Array.isArray(o.assignedRoutes) ? o.assignedRoutes : null,
    logoutAt: typeof o.logoutAt === 'number' && Number.isFinite(o.logoutAt) ? o.logoutAt : null,
  };
}
export function canonicalLogoutAdvanced(baseline: number | null, logoutAt: number | null): boolean {
  return baseline !== null && logoutAt !== null && logoutAt > baseline;
}
