/**
 * Current-shift authority presentation (safety containment).
 *
 * A cached `wellbuilt-current-shift-id` is a HINT, never authority.
 * Only an authoritative driver_shifts resolution for the authenticated
 * canonical driver may label a shift active. 404, an unverified origin
 * day, a missing request binding, or an unavailable authority must NOT
 * preserve that hint as current.
 *
 * Historical JSA records (`@jsa/saves`, `@jsa/activeJsas`) are a
 * different store. This module never deletes them or rewrites their
 * shift binding.
 *
 * Pure + node-testable; no I/O.
 */

export const SHIFT_UNVERIFIED_COPY =
  'Current WellBuilt shift could not be verified. Return to WellBuilt and try again.';

export const CURRENT_SHIFT_VERIFIED_KEY = '@jsa/currentShiftVerified';
export const GOVERNED_RETURN_KEY = '@jsa/governedReturnRequired';
export const CURRENT_SHIFT_ID_KEY = 'wellbuilt-current-shift-id';

export type ShiftAuthorityKind =
  | 'verified_active'
  | 'stale_cached'
  | 'authority_none'
  | 'authority_unavailable'
  | 'origin_day_unverified';

export type ShiftSurface =
  | 'jsa_content'
  | 'unverified_gate'
  | 'history_only'
  | 'legacy_login';

export type OriginVerdict =
  | 'verified_open'
  | 'verified_closed'
  | 'unverified'
  | 'not_consulted';

export type CurrentCacheAction = 'keep_verified' | 'clear_current' | 'none';

export type GovernedReturnTarget = 'wbt' | 'suite';

/** Today's driver_shifts fetch, already classified. */
export interface TodayAuthorityFetch {
  /** Transport + parse succeeded (HTTP 404 counts as succeeded-empty). */
  fetchOk: boolean;
  httpStatus: number | null;
  /** Non-empty currentShiftId from today's doc, else null. */
  currentShiftId: string | null;
  explicitlyEnded: boolean;
}

export interface PendingRequestClaims {
  requestShiftId: string | null;
  requestCompanyId: string | null;
  requestDriverId: string | null;
}

export interface ShiftAuthorityInput {
  isAuthenticated: boolean;
  authenticatedDriverId: string | null;
  authenticatedCompanyId: string | null;
  cachedShiftId: string | null;
  today: TodayAuthorityFetch | null;
  originVerdict: OriginVerdict;
  isGovernedLaunch: boolean;
  governedReturnRequired: boolean;
  pendingRequest: PendingRequestClaims | null;
}

export interface ShiftAuthorityDecision {
  kind: ShiftAuthorityKind;
  mayLabelActive: boolean;
  activeShiftId: string | null;
  mayShowWelcome: boolean;
  mayShowLegacyLogin: boolean;
  surface: ShiftSurface;
  copy: string | null;
  historicalAccessible: true;
  currentCacheAction: CurrentCacheAction;
  pendingRequestBound: boolean;
}

/** Explicit Suite/WB shift ids look like `YYYY-MM-DD_HHMMSS`. A bare date is not a shift. */
export function isExplicitShiftId(id: string | null | undefined): boolean {
  return typeof id === 'string' && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(id);
}

export function isGovernedReturnTo(returnTo: string | null | undefined): boolean {
  return returnTo === 'wbt' || returnTo === 'wbs' || returnTo === 'wellbuilt-suite';
}

export function decideGovernedReturnMark(input: {
  authMethod: string | null;
  hasPendingRequest: boolean;
  returnTo: string | null;
}): { mark: boolean; returnTarget: GovernedReturnTarget } {
  const fromWbt = input.returnTo === 'wbt' || input.hasPendingRequest;
  const governed =
    input.authMethod === 'sso' ||
    input.hasPendingRequest ||
    isGovernedReturnTo(input.returnTo);
  return {
    mark: governed,
    returnTarget: fromWbt ? 'wbt' : 'suite',
  };
}

export function decideUnauthenticatedOverlay(input: {
  governedReturnRequired: boolean;
  hasPendingRequest: boolean;
  isGovernedLaunch: boolean;
}): Exclude<ShiftSurface, 'jsa_content' | 'history_only'> {
  if (input.governedReturnRequired || input.hasPendingRequest || input.isGovernedLaunch) {
    return 'unverified_gate';
  }
  return 'legacy_login';
}

export function mayShowWelcomeModal(input: {
  isAuthenticated: boolean;
  mayLabelActive: boolean;
}): boolean {
  return input.isAuthenticated && input.mayLabelActive;
}

function requestBindsTo(
  pending: PendingRequestClaims | null,
  activeShiftId: string | null,
  driverId: string | null,
  companyId: string | null,
): boolean {
  if (!pending || !activeShiftId || !isExplicitShiftId(pending.requestShiftId)) return false;
  if (pending.requestShiftId !== activeShiftId) return false;
  if (!pending.requestCompanyId) return false;
  if (pending.requestDriverId && driverId && pending.requestDriverId !== driverId) return false;
  if (pending.requestCompanyId && companyId && pending.requestCompanyId !== companyId) return false;
  return true;
}

function gate(kind: ShiftAuthorityKind, cache: CurrentCacheAction): ShiftAuthorityDecision {
  return {
    kind,
    mayLabelActive: false,
    activeShiftId: null,
    mayShowWelcome: false,
    mayShowLegacyLogin: false,
    surface: 'unverified_gate',
    copy: SHIFT_UNVERIFIED_COPY,
    historicalAccessible: true,
    currentCacheAction: cache,
    pendingRequestBound: false,
  };
}

function historyOnly(
  kind: ShiftAuthorityKind,
  cache: CurrentCacheAction,
  mayShowLegacyLogin: boolean,
): ShiftAuthorityDecision {
  return {
    kind,
    mayLabelActive: false,
    activeShiftId: null,
    mayShowWelcome: false,
    mayShowLegacyLogin,
    surface: mayShowLegacyLogin ? 'legacy_login' : 'history_only',
    copy: null,
    historicalAccessible: true,
    currentCacheAction: cache,
    pendingRequestBound: false,
  };
}

function active(shiftId: string): ShiftAuthorityDecision {
  return {
    kind: 'verified_active',
    mayLabelActive: true,
    activeShiftId: shiftId,
    mayShowWelcome: true,
    mayShowLegacyLogin: false,
    surface: 'jsa_content',
    copy: null,
    historicalAccessible: true,
    currentCacheAction: 'keep_verified',
    pendingRequestBound: false,
  };
}

/**
 * Decide whether a cached or fetched shift may be labeled the current
 * active WellBuilt shift for this authenticated driver.
 */
export function decideShiftAuthority(input: ShiftAuthorityInput): ShiftAuthorityDecision {
  const standaloneLogin =
    !input.isAuthenticated &&
    !input.isGovernedLaunch &&
    !input.governedReturnRequired &&
    !input.pendingRequest;

  const requireGate =
    input.isGovernedLaunch ||
    input.governedReturnRequired ||
    !!input.pendingRequest;

  // Authority unreachable — never present a cache as current.
  if (!input.today || !input.today.fetchOk) {
    const decided = requireGate
      ? gate('authority_unavailable', input.cachedShiftId ? 'clear_current' : 'none')
      : historyOnly(
          'authority_unavailable',
          input.cachedShiftId ? 'clear_current' : 'none',
          standaloneLogin,
        );
    return applyPending(input, decided);
  }

  // Today's doc names an open shift for this authenticated driver.
  if (
    input.isAuthenticated &&
    input.authenticatedDriverId &&
    input.today.currentShiftId &&
    isExplicitShiftId(input.today.currentShiftId)
  ) {
    return applyPending(input, active(input.today.currentShiftId));
  }

  // Today's doc explicitly ended the period.
  if (input.today.explicitlyEnded) {
    const kind: ShiftAuthorityKind = input.cachedShiftId ? 'stale_cached' : 'authority_none';
    const decided = requireGate
      ? gate(kind, 'clear_current')
      : historyOnly(kind, 'clear_current', standaloneLogin);
    return applyPending(input, decided);
  }

  // Today's lookup had no signal — consult origin-day verdict on the cache.
  if (input.cachedShiftId) {
    if (input.originVerdict === 'verified_open' && input.isAuthenticated && input.authenticatedDriverId) {
      return applyPending(input, active(input.cachedShiftId));
    }
    if (input.originVerdict === 'verified_closed') {
      const decided = requireGate
        ? gate('stale_cached', 'clear_current')
        : historyOnly('stale_cached', 'clear_current', false);
      return applyPending(input, decided);
    }
    if (input.originVerdict === 'unverified') {
      const decided = requireGate
        ? gate('origin_day_unverified', 'clear_current')
        : historyOnly('origin_day_unverified', 'clear_current', false);
      return applyPending(input, decided);
    }
    // Cache present but origin not consulted — still not a licence to label.
    const decided = requireGate
      ? gate('stale_cached', 'clear_current')
      : historyOnly('stale_cached', 'clear_current', false);
    return applyPending(input, decided);
  }

  const none = requireGate
    ? gate('authority_none', 'none')
    : historyOnly('authority_none', 'none', standaloneLogin);
  return applyPending(input, none);
}

function applyPending(
  input: ShiftAuthorityInput,
  decided: ShiftAuthorityDecision,
): ShiftAuthorityDecision {
  if (!input.pendingRequest) {
    return { ...decided, pendingRequestBound: false };
  }
  const bound = requestBindsTo(
    input.pendingRequest,
    decided.activeShiftId,
    input.authenticatedDriverId,
    input.authenticatedCompanyId,
  );
  if (bound) {
    return { ...decided, pendingRequestBound: true };
  }
  // Pending request with mismatched or missing shift — fail closed.
  // Independently verified shift ids stay in cache (keep_verified) so a
  // later governed launch can bind; they are not labeled active on this
  // unbound request.
  return {
    ...decided,
    mayLabelActive: false,
    mayShowWelcome: false,
    mayShowLegacyLogin: false,
    surface: 'unverified_gate',
    copy: SHIFT_UNVERIFIED_COPY,
    pendingRequestBound: false,
    activeShiftId: decided.currentCacheAction === 'keep_verified' ? decided.activeShiftId : null,
  };
}
