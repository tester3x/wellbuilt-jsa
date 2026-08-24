export interface GovernedHistoricalIdentity { uid: string; driverId: string; companyId: string; }

export function governedHistoricalQuery(identity: GovernedHistoricalIdentity) {
  if (!identity.uid || !identity.driverId || !identity.companyId) return null;
  return { field: 'driverId' as const, value: identity.driverId };
}

export function classifyGovernedHistoricalRecord(
  fields: Record<string, unknown>,
  identity: GovernedHistoricalIdentity,
): 'canonical_match' | 'foreign' | 'backend_required' {
  const driverId = typeof fields.driverId === 'string' ? fields.driverId : null;
  const companyId = typeof fields.companyId === 'string' ? fields.companyId : null;
  if (!driverId || !companyId) return 'backend_required';
  return driverId === identity.driverId && companyId === identity.companyId
    ? 'canonical_match' : 'foreign';
}
