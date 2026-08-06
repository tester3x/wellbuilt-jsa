// services/requestPeriodBinding.ts — vc51.9B canonical request-period
// binding for WB-T read requests.
//
// FIRST RUNTIME USE of @tester3x/wellbuilt-contracts in WB-JSA: period
// semantics come from the package — resolveWorkPeriod decides, and
// mayBindRequestEvidence gates request-bound completion. No UTC-date
// fallback, no cached-shift authority, no copied period math.
//
// Deep-link fields are UNTRUSTED wake hints: the caller must resolve
// authoritative evidence independently (resolveSubmissionPeriod) and
// this validator proves the request's claims against that resolution.
//
// Version negotiation (staged rollout, WB-JSA installs first):
//   - a legacy v1 request receives v1 legacy behavior (inert — old
//     installed WB-T understands v1 only);
//   - a v2-capable request REQUIRES the full period proof; it never
//     downgrades to v1;
//   - every mismatch/closed/invalid/unverified outcome produces NO
//     receipt (fail closed, recoverable by retrying in a valid period).

import {
  CONTRACT_VERSION,
  isOperationallyOpen,
  mayBindRequestEvidence,
  resolveWorkPeriod,
  type WorkPeriodMode,
  type WorkPeriodResolution,
} from '@tester3x/wellbuilt-contracts';

export interface BindingRequestClaims {
  receiptVersion: 1 | 2;
  contractVersion?: number;
  companyId: string;
  driverHash: string;
  periodId?: string | null;
  workPeriodMode?: WorkPeriodMode | null;
}

export interface BindingSession {
  companyId: string | null;
  driverHash: string | null;
}

export type BindingVerdict =
  | { ok: true; receiptVersion: 1 }
  | { ok: true; receiptVersion: 2; submissionPeriodId: string; workPeriodMode: WorkPeriodMode }
  | { ok: false; reason:
      | 'unsupported_contract_version'
      | 'company_mismatch'
      | 'driver_mismatch'
      | 'missing_request_period'
      | 'period_not_open'
      | 'period_unverified'
      | 'period_mismatch'
      | 'mode_mismatch'; };

/**
 * Judge a request against the INDEPENDENTLY resolved period. Pure —
 * callers fetch evidence and resolve through the canonical package.
 */
export function validateRequestPeriodBinding(
  request: BindingRequestClaims,
  session: BindingSession,
  resolution: WorkPeriodResolution | null,
): BindingVerdict {
  // v1 legacy requests: inert path — old installed WB-T understands v1
  // only; the existing v1 validation chain still applies downstream.
  if (request.receiptVersion === 1) return { ok: true, receiptVersion: 1 };

  if (request.contractVersion !== undefined && request.contractVersion !== CONTRACT_VERSION) {
    return { ok: false, reason: 'unsupported_contract_version' };
  }
  if (!session.companyId || session.companyId !== request.companyId) {
    return { ok: false, reason: 'company_mismatch' };
  }
  if (!session.driverHash || session.driverHash !== request.driverHash) {
    return { ok: false, reason: 'driver_mismatch' };
  }
  if (!request.periodId) return { ok: false, reason: 'missing_request_period' };

  if (!resolution || resolution.outcome === 'UNVERIFIED_OFFLINE') {
    return { ok: false, reason: 'period_unverified' };
  }
  if (!isOperationallyOpen(resolution) || !mayBindRequestEvidence(resolution)) {
    return { ok: false, reason: 'period_not_open' };
  }
  if (resolution.periodId !== request.periodId) {
    return { ok: false, reason: 'period_mismatch' };
  }
  if (request.workPeriodMode && resolution.mode !== request.workPeriodMode) {
    return { ok: false, reason: 'mode_mismatch' };
  }
  return {
    ok: true,
    receiptVersion: 2,
    submissionPeriodId: resolution.periodId,
    workPeriodMode: resolution.mode,
  };
}

/**
 * Independently resolve the driver's CURRENT period through the
 * canonical resolver. Explicit mode fetches today's authoritative
 * driver_shifts doc (plus the cached shift's origin day when needed);
 * derived mode resolves from the supplied configuration. The caller
 * supplies fetchers so this stays node-testable.
 */
export async function resolveSubmissionPeriod(deps: {
  companyId: string;
  driverHash: string;
  mode: WorkPeriodMode;
  nowMs: number;
  localDate: string;
  cachedShiftId?: string | null;
  fetchDayDoc: (date: string) => Promise<{ readable: boolean; present: boolean; currentShiftId?: string }>;
  derivedConfig?: { timezone?: string; startLocalTime?: string; durationMinutes?: number };
}): Promise<WorkPeriodResolution> {
  const capabilities = {
    contractVersion: CONTRACT_VERSION,
    companyId: deps.companyId,
    suiteLoginRequired: true,
    workPeriodMode: deps.mode,
    explicitShiftRequiredBeforeJobs: deps.mode === 'explicit_shift',
    jsaEnabled: true,
    dvirEnabled: false,
    customerEditableFields: [] as Array<'timezone' | 'startLocalTime' | 'durationMinutes' | 'mode' | 'contractVersion' | 'configurationVersion'>,
  };
  const config = {
    contractVersion: CONTRACT_VERSION,
    configurationVersion: 1,
    mode: deps.mode,
    ...(deps.derivedConfig ?? {}),
  };
  let evidence;
  if (deps.mode === 'explicit_shift') {
    const today = await deps.fetchDayDoc(deps.localDate);
    let cachedOriginDay = null;
    const cached = deps.cachedShiftId ?? null;
    const originDate = cached && /^\d{4}-\d{2}-\d{2}/.test(cached) ? cached.slice(0, 10) : null;
    if (cached && originDate && originDate !== deps.localDate) {
      cachedOriginDay = await deps.fetchDayDoc(originDate);
    }
    evidence = { today, cachedShiftId: cached, cachedOriginDay };
  }
  return resolveWorkPeriod({
    contractVersion: CONTRACT_VERSION,
    companyId: deps.companyId,
    driverId: deps.driverHash,
    capabilities,
    config,
    evidence,
    nowMs: deps.nowMs,
    todayLocalDate: deps.localDate,
  });
}
