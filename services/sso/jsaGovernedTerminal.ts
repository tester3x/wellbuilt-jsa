/**
 * Explicit distinction between a current-session governed success
 * and a later genuine replay of an already-completed request.
 *
 * Import-free test leaf. Persistence lives in jsaRuntime.
 */

export const FRESH_GOVERNED_SUBMITTED_KEY = '@jsa/freshGovernedSubmitted';

export type FreshSubmittedMarker = {
  requestId: string;
  action: string;
  submittedAtMs: number;
};

export type CompletedTerminalSurface =
  | 'fresh_submitted'
  | 'already_completed'
  | 'none';

export function parseFreshSubmittedMarker(raw: unknown): FreshSubmittedMarker | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.requestId !== 'string' || !o.requestId) return null;
  if (typeof o.action !== 'string' || !o.action) return null;
  if (typeof o.submittedAtMs !== 'number' || !Number.isFinite(o.submittedAtMs)) return null;
  return {
    requestId: o.requestId,
    action: o.action,
    submittedAtMs: o.submittedAtMs,
  };
}

export function markerMatchesRequest(
  marker: FreshSubmittedMarker | null,
  requestId: string | null,
): boolean {
  return !!marker && !!requestId && marker.requestId === requestId;
}

/**
 * Completed-context routing.
 *
 * - Marker for this request + still-active launch → same-session success.
 * - Active launch for the completed request without a matching marker → later replay.
 * - No launch (Stay consumed it) → clean home. Do not infer replay from the save alone.
 */
export function decideCompletedTerminalSurface(input: {
  contextState: string | null;
  contextRequestId: string | null;
  launchRequestId: string | null;
  marker: FreshSubmittedMarker | null;
}): CompletedTerminalSurface {
  if (input.contextState !== 'completed' || !input.contextRequestId) return 'none';
  if (markerMatchesRequest(input.marker, input.contextRequestId)
    && input.launchRequestId === input.contextRequestId) {
    return 'fresh_submitted';
  }
  if (input.launchRequestId === input.contextRequestId) return 'already_completed';
  return 'none';
}

export function hrefForCompletedTerminal(
  surface: CompletedTerminalSurface,
  action?: string | null,
  reused?: boolean,
): { pathname: string; params?: Record<string, string> } | '/(tabs)' {
  if (surface === 'none') return '/(tabs)';
  if (surface === 'fresh_submitted') {
    return {
      pathname: '/governed-status',
      params: {
        mode: 'submitted',
        ...(action ? { action } : {}),
      },
    };
  }
  return {
    pathname: '/governed-status',
    params: {
      mode: 'completed',
      ...(action ? { action } : {}),
      ...(reused ? { reused: '1' } : {}),
    },
  };
}

/** Governed combined terminal wording. Never "Recorded as acknowledged". */
export function governedCombinedTerminalCopy(action: string | null | undefined): string {
  if (action === 'read_and_acknowledged') return 'Read and acknowledged';
  if (action === 'read_completed') return 'Read';
  if (action === 'acknowledged') return 'Acknowledged';
  return '';
}

export function submittedHeading(): 'JSA Submitted' {
  return 'JSA Submitted';
}

export function replayHeading(): 'Already completed' {
  return 'Already completed';
}

/** Current-flow complete records fresh success even when the server says reused. */
export function shouldRecordFreshSubmitted(input: { kind: string }): boolean {
  return input.kind === 'completed';
}

/**
 * Return consumes transient launch/nav only after Linking actually accepted the URL.
 * A failed handoff retains the marker so the submitted surface can be restored.
 */
export function decideAfterReturnHandoff(opened: boolean): 'consume' | 'retain' {
  return opened ? 'consume' : 'retain';
}
