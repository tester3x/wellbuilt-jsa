/**
 * Fail-closed Job Details / Next /steps isolation.
 *
 * jsa_returnTo is a return destination only. It is never authentication
 * evidence and never failure evidence. Governed workflow unlocks only
 * after Auth-bound session AND matching authoritative request context.
 *
 * Import-free — node-testable.
 */

export type IsolationReason =
  | 'unresolved'
  | 'unverified_gate'
  | 'governed_failed'
  | 'auth_pending'
  | null;

export type StepsGuard = 'unresolved' | 'allowed' | 'denied';

export type IsolationSurfaceKind = 'connecting' | 'unverified_gate' | 'governed_failed';

export interface IsolationInput {
  resolved: boolean;
  authoritySurface: string | null;
  explicitGovernedFailure: boolean;
  hasGovernedLaunch: boolean;
  hasUsableGovernedSession: boolean;
  hasMatchingAuthoritativeContext: boolean;
  authPending: boolean;
}

export interface JobDetailsIsolation {
  blocked: boolean;
  reason: IsolationReason;
  mountForm: boolean;
  mountNext: boolean;
  storedFieldsActionable: boolean;
  isolateOnly: boolean;
  surface: IsolationSurfaceKind | null;
}

export const GOVERNED_CONNECTING_COPY = 'Signing in to WellBuilt JSA…';
export const GOVERNED_FAILED_COPY =
  'Could not sign in to WellBuilt JSA. Return to WellBuilt Tickets and launch again.';
export const GOVERNED_RESOLVING_COPY = 'Opening WellBuilt JSA…';
export const INITIAL_OWNER_RESUME_TTL_MS = 180_000;

export function initialStartMayOwn(input: {
  installationSeen: boolean;
  ignoredSameRequest: boolean;
  ownerSameRequest: boolean;
  ownerAgeMs: number | null;
}): boolean {
  if (input.ignoredSameRequest) return false;
  if (!input.ownerSameRequest) return true;
  return input.ownerAgeMs !== null && input.ownerAgeMs >= 0 && input.ownerAgeMs <= INITIAL_OWNER_RESUME_TTL_MS;
}

/**
 * Root launch-resolution overlay (vc10). The moment a valid governed
 * /start candidate is accepted for processing, the app is unresolved:
 * historical local content — Job Details, saved acknowledgment records,
 * "Already completed" — must not render as the active launch. Only the
 * connecting surface shows until the run navigates or fails closed.
 * Zero in-flight candidates → normal (icon/standalone) presentation.
 */
export function launchResolutionBlocksContent(resolvingCount: number): boolean {
  return resolvingCount > 0;
}

/**
 * A matching successful protected get already proved this launch's shift
 * on the server. Missing passcode-session / calendar-day driver_shifts is
 * not a request refusal and must not paint "Shift not verified".
 */
export function authorizedGovernedRequestReady(input: {
  hasGovernedLaunch: boolean;
  hasUsableGovernedSession: boolean;
  hasMatchingAuthoritativeContext: boolean;
  explicitGovernedFailure: boolean;
}): boolean {
  return input.hasGovernedLaunch
    && input.hasUsableGovernedSession
    && input.hasMatchingAuthoritativeContext
    && !input.explicitGovernedFailure;
}

export function decideJobDetailsIsolation(input: IsolationInput): JobDetailsIsolation {
  let reason: IsolationReason = null;
  if (!input.resolved) {
    reason = 'unresolved';
  } else if (input.hasGovernedLaunch && input.explicitGovernedFailure) {
    reason = 'governed_failed';
  } else if (authorizedGovernedRequestReady(input)) {
    reason = null;
  } else if (input.hasGovernedLaunch && input.authoritySurface === 'unverified_gate') {
    reason = 'unverified_gate';
  } else if (
    input.authPending
    || (input.hasGovernedLaunch && !input.hasUsableGovernedSession)
    || (input.hasGovernedLaunch && !input.hasMatchingAuthoritativeContext)
  ) {
    reason = 'auth_pending';
  }
  const blocked = reason !== null;
  return {
    blocked,
    reason,
    mountForm: !blocked,
    mountNext: !blocked,
    storedFieldsActionable: !blocked,
    isolateOnly: blocked,
    surface: isolationSurfaceKind(reason),
  };
}

export function isolationSurfaceKind(reason: IsolationReason): IsolationSurfaceKind | null {
  if (reason === 'unresolved' || reason === 'auth_pending') return 'connecting';
  if (reason === 'unverified_gate') return 'unverified_gate';
  if (reason === 'governed_failed') return 'governed_failed';
  return null;
}

export function unresolvedJobDetailsIsolation(): JobDetailsIsolation {
  return decideJobDetailsIsolation({
    resolved: false,
    authoritySurface: null,
    explicitGovernedFailure: false,
    hasGovernedLaunch: false,
    hasUsableGovernedSession: false,
    hasMatchingAuthoritativeContext: false,
    authPending: false,
  });
}

export function authoritativeContextMatchesLaunch(input: {
  launchRequestId: string | null | undefined;
  contextRequestId: string | null | undefined;
}): boolean {
  return !!input.launchRequestId
    && !!input.contextRequestId
    && input.launchRequestId === input.contextRequestId;
}

/** A return destination never completes, waives, or fails Job Details. */
export function returnToSatisfiesJobDetails(_returnTo: unknown): false {
  void _returnTo;
  return false;
}

export function returnToIsGovernedFailure(_returnTo: unknown): false {
  void _returnTo;
  return false;
}

/**
 * deepLinked must not be derived from jsa_returnTo.
 * Only real job context (wells/locations) may mark a launch complete.
 */
export function hasValidatedJobContext(params: {
  wellName?: unknown;
  disposal?: unknown;
  location?: unknown;
  wells?: unknown;
} | null | undefined): boolean {
  if (!params) return false;
  if (typeof params.wellName === 'string' && params.wellName.trim()) return true;
  if (typeof params.disposal === 'string' && params.disposal.trim()) return true;
  if (typeof params.location === 'string' && params.location.trim()) return true;
  if (Array.isArray(params.wells) && params.wells.length > 0) return true;
  return false;
}

export function effectiveDeepLinkedForJobDetails(input: {
  returnToSet: boolean;
  hasJobContext: boolean;
}): boolean {
  if (input.returnToSet && !input.hasJobContext) return false;
  return input.hasJobContext;
}

export function handleNextAllowed(blocked: boolean): boolean {
  return !blocked;
}

export function stepsRouteAllowed(blocked: boolean): boolean {
  return !blocked;
}

export function stepsContentAllowed(guard: StepsGuard): boolean {
  return guard === 'allowed';
}

export function iconReopenSurface(input: {
  explicitGovernedFailure: boolean;
  authoritySurface: string | null;
  hasGovernedLaunch: boolean;
  hasUsableGovernedSession: boolean;
  hasMatchingAuthoritativeContext: boolean;
}): 'isolated_gate' | 'standalone' {
  if (input.hasGovernedLaunch && input.explicitGovernedFailure) {
    return 'isolated_gate';
  }
  if (authorizedGovernedRequestReady({
    hasGovernedLaunch: input.hasGovernedLaunch,
    hasUsableGovernedSession: input.hasUsableGovernedSession,
    hasMatchingAuthoritativeContext: input.hasMatchingAuthoritativeContext,
    explicitGovernedFailure: false,
  })) {
    return 'standalone';
  }
  if (input.hasGovernedLaunch && input.authoritySurface === 'unverified_gate') {
    return 'isolated_gate';
  }
  if (input.hasGovernedLaunch && !input.hasUsableGovernedSession) {
    return 'isolated_gate';
  }
  if (input.hasGovernedLaunch && !input.hasMatchingAuthoritativeContext) {
    return 'isolated_gate';
  }
  return 'standalone';
}
