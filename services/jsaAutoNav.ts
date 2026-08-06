// services/jsaAutoNav.ts — vc51.9B request-aware auto-navigation decision.
//
// ONE pure function decides whether the home screen may auto-open an
// existing JSA record. The 8/6-class defect family (a prior-period
// submitted JSA auto-opening as "Current Shift JSA") is closed by rule,
// not by call-site luck:
//
//   - cached/current state is a HINT; only a verified-open period whose
//     shift id MATCHES the record's shift id may present it as current;
//   - while a WB-T read request is pending, an unrelated prior record
//     never auto-opens — the request-bound flow wins;
//   - 'unverified' NEVER opens stale detail: with a pending request it
//     is a bounded blocking state, without one it just suppresses;
//   - standalone (non-SSO) date-scoped behavior is legacy and preserved.
//
// Pure + node-testable; no imports.

export type ShiftVerdictKind =
  | 'server_open'      // today's authoritative doc names an open shift
  | 'server_ended'     // today's doc explicitly ended the shift
  | 'verified_open'    // origin-day verification confirmed the cached id
  | 'verified_closed'  // origin-day verification closed/superseded it
  | 'unverified'       // could not verify (offline/unreadable) — never open
  | 'none';            // no verdict yet / standalone

export interface AutoNavInput {
  pendingRequestUsable: boolean;
  verdict: ShiftVerdictKind;
  saveExists: boolean;
  /** Shift id the candidate record is bound to (null = date-scoped standalone). */
  saveShiftId: string | null;
  currentShiftId: string | null;
  isSsoMode: boolean;
}

export type AutoNavDecision =
  | { action: 'open_current' }
  | { action: 'suppress'; reason: string }
  | { action: 'blocked'; reason: string };

const isOpenVerdict = (v: ShiftVerdictKind) => v === 'server_open' || v === 'verified_open';

export function decideAutoNavigation(input: AutoNavInput): AutoNavDecision {
  if (!input.saveExists) return { action: 'suppress', reason: 'no_record' };

  // Standalone/legacy (no shift semantics at all): the date-scoped record
  // is the established behavior — preserved, inert to enforcement.
  if (!input.isSsoMode && input.saveShiftId === null) {
    return { action: 'open_current' };
  }

  const matchesVerifiedCurrent =
    isOpenVerdict(input.verdict) &&
    input.saveShiftId !== null &&
    input.currentShiftId !== null &&
    input.saveShiftId === input.currentShiftId;

  if (input.pendingRequestUsable) {
    if (matchesVerifiedCurrent) return { action: 'open_current' };
    if (input.verdict === 'unverified') {
      return { action: 'blocked', reason: 'pending_request_period_unverified' };
    }
    return { action: 'suppress', reason: 'pending_request_record_not_in_period' };
  }

  if (matchesVerifiedCurrent) return { action: 'open_current' };
  if (input.verdict === 'unverified') return { action: 'suppress', reason: 'period_unverified' };
  if (input.verdict === 'server_ended' || input.verdict === 'verified_closed') {
    return { action: 'suppress', reason: 'period_closed' };
  }
  return { action: 'suppress', reason: 'record_not_in_current_period' };
}

/** Banner labels: "current" wording ONLY for a verified matching period. */
export function currentJsaBannerLabel(
  mode: 'explicit_shift' | 'company_defined_period',
): string {
  return mode === 'company_defined_period'
    ? 'View Current Work Period JSA'
    : 'View Current Shift JSA';
}

export const HISTORICAL_JSA_LABEL = 'View Previous JSA';
