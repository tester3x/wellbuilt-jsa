/**
 * Cached-shift staleness resolution (vc51.7, 8/6 emergency fix).
 *
 * FIELD DEFECT PROVEN 8/6: WB-S correctly ended shift 2026-08-05_091221 at
 * 22:10:56Z and recorded the authoritative closure
 * (driver_shifts/{hash}_2026-08-05.currentShiftId = ""). The next day, with
 * no shift started, refreshShiftIdFromServer looked up ONLY today's doc
 * (driver_shifts/{hash}_2026-08-06), got a 404, classified that as
 * "ambiguous", and PRESERVED the cached prior-day id — resurrecting a
 * closed shift as "current". WB-JSA then presented yesterday's submitted
 * JSA as the current-shift JSA and auto-opened it.
 *
 * The authoritative signal existed the whole time; it was simply never
 * consulted, because the closure is recorded on the shift's OWN day
 * document, not on today's.
 *
 * This module decides — purely — whether a cached shift id may still be
 * current. It deliberately does NOT invent a period boundary: it never
 * assumes midnight ends a shift and never applies a fixed 12/14-hour
 * window. A prior-day cached id is only a REASON TO ASK its origin-day
 * document; that document alone decides:
 *
 *   currentShiftId === cachedId  → still open (legitimate overnight shift)
 *   currentShiftId === ''        → WB-S explicitly ended it → clear
 *   currentShiftId === other id  → superseded by a newer shift  → clear
 *   doc missing / no field / err → unverified → clear as CURRENT
 *
 * Unverified is not a licence to present the cache as the current shift.
 * Historical JSA records are a different store and are never deleted here.
 */

/** Origin-day document as read from driver_shifts/{hash}_{shiftDate}. */
export interface OriginDayShiftDoc {
  /** False when the doc is missing, unreadable, or the fetch failed. */
  readable: boolean;
  /** driver_shifts.currentShiftId — undefined when the field is absent. */
  currentShiftId?: string;
}

/**
 * Authoritative lifecycle verdict for a cached explicit shift (vc51.8).
 *
 * vc51.7's first correction validated only PRIOR-DAY caches, leaving a
 * same-day close unverified: shift A starts and ends on the same calendar
 * day, the logout signal is missed (backgrounded/offline), WB-JSA reopens
 * later that day, and the cached id's date still equals today. Staleness
 * is therefore NOT a date question — it is a lifecycle question, and every
 * cached explicit shift must be answerable against its origin day.
 *
 *   'verified_open'   — the origin day names exactly this shift: current.
 *   'verified_closed' — explicitly ended ('') or superseded by another id.
 *   'unverified'      — origin day unreadable/absent/field missing. NOT a
 *                       licence to proceed or to label the cache current.
 *                       Historical UI may still list prior JSAs as history.
 */
export type PeriodVerdict = 'verified_open' | 'verified_closed' | 'unverified';

/** Lifecycle verdict from the shift's own day document — date-independent. */
export function verifyCachedShift(
  cachedShiftId: string | null | undefined,
  doc: OriginDayShiftDoc,
): PeriodVerdict {
  if (!cachedShiftId) return 'verified_closed';
  if (!doc || !doc.readable) return 'unverified';
  const cur = doc.currentShiftId;
  if (typeof cur !== 'string') return 'unverified';
  return cur === cachedShiftId ? 'verified_open' : 'verified_closed';
}

/** 'YYYY-MM-DD' prefix of a shift id, or null when it has none. */
export function shiftDateOf(shiftId: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(shiftId || ''));
  return m ? m[1] : null;
}

/**
 * Does this cached id need its origin day verified? True only when the id
 * carries a date prefix STRICTLY EARLIER than today's local date. Same-day
 * ids are left alone (today's own lookup already governs them).
 */
export function needsOriginDayCheck(
  cachedShiftId: string | null | undefined,
  todayLocalDate: string,
): boolean {
  const d = shiftDateOf(cachedShiftId);
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(todayLocalDate)) return false;
  return d < todayLocalDate;
}

/**
 * Decide a prior-day cached shift's fate from its origin-day document.
 * 'preserve' keeps the cached id ONLY when the origin day names it as
 * still open. Unreadable / missing / ended / superseded → 'clear' so the
 * cache cannot be labeled current. Historical JSA records are untouched.
 */
export function decideFromOriginDay(
  cachedShiftId: string,
  doc: OriginDayShiftDoc,
): 'preserve' | 'clear' {
  if (!doc || !doc.readable) return 'clear';
  const cur = doc.currentShiftId;
  if (typeof cur !== 'string') return 'clear';
  if (cur === cachedShiftId) return 'preserve';
  return 'clear';
}

/**
 * Whole decision for the ambiguous branch: today's authoritative lookup
 * produced no signal, so classify the cached id. `fetchOriginDay` is only
 * consulted for prior-day ids — same-day caches never hit the network.
 */
export async function resolveCachedShift(
  cachedShiftId: string | null | undefined,
  todayLocalDate: string,
  fetchOriginDay: (shiftDate: string) => Promise<OriginDayShiftDoc>,
): Promise<{ action: 'preserve' | 'clear'; verdict: PeriodVerdict; reason: string }> {
  if (!cachedShiftId) {
    return { action: 'preserve', verdict: 'verified_closed', reason: 'no_cached_shift' };
  }
  // vc51.8: EVERY cached explicit shift is validated — same-day included.
  // A shift that opened and closed within one calendar day is exactly the
  // case a date-only rule missed. The caller may satisfy a same-day lookup
  // from the day document it already read, so this costs no extra request.
  const shiftDate = shiftDateOf(cachedShiftId) || todayLocalDate;
  let doc: OriginDayShiftDoc = { readable: false };
  try {
    doc = await fetchOriginDay(shiftDate);
  } catch {
    doc = { readable: false };
  }
  const verdict = verifyCachedShift(cachedShiftId, doc);
  if (verdict === 'verified_open') {
    return { action: 'preserve', verdict, reason: 'origin_day_still_open' };
  }
  if (verdict === 'verified_closed') {
    return {
      action: 'clear',
      verdict,
      reason: doc.currentShiftId === '' ? 'origin_day_explicitly_ended' : 'origin_day_superseded',
    };
  }
  return {
    action: 'clear',
    verdict: 'unverified',
    reason: 'origin_day_unverified',
  };
}
