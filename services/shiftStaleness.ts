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
 *   doc missing / no field / err → genuinely ambiguous → preserve
 *
 * The ambiguous branch keeps the 4/28 protection (a transient failure must
 * never wipe a live shift) while closing the case that protection was
 * never meant to cover.
 */

/** Origin-day document as read from driver_shifts/{hash}_{shiftDate}. */
export interface OriginDayShiftDoc {
  /** False when the doc is missing, unreadable, or the fetch failed. */
  readable: boolean;
  /** driver_shifts.currentShiftId — undefined when the field is absent. */
  currentShiftId?: string;
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
 * 'preserve' keeps the cached id (overnight shift still open, or the
 * origin day is unreadable); 'clear' removes it (explicitly ended or
 * superseded) so callers fail closed instead of reusing a closed shift.
 */
export function decideFromOriginDay(
  cachedShiftId: string,
  doc: OriginDayShiftDoc,
): 'preserve' | 'clear' {
  if (!doc || !doc.readable) return 'preserve';
  const cur = doc.currentShiftId;
  if (typeof cur !== 'string') return 'preserve';
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
): Promise<{ action: 'preserve' | 'clear'; reason: string }> {
  if (!cachedShiftId) return { action: 'preserve', reason: 'no_cached_shift' };
  if (!needsOriginDayCheck(cachedShiftId, todayLocalDate)) {
    return { action: 'preserve', reason: 'same_day_cache' };
  }
  const shiftDate = shiftDateOf(cachedShiftId) as string;
  let doc: OriginDayShiftDoc = { readable: false };
  try {
    doc = await fetchOriginDay(shiftDate);
  } catch {
    doc = { readable: false };
  }
  const action = decideFromOriginDay(cachedShiftId, doc);
  return {
    action,
    reason: action === 'clear'
      ? (doc.currentShiftId === '' ? 'origin_day_explicitly_ended' : 'origin_day_superseded')
      : (doc.readable ? 'origin_day_still_open' : 'origin_day_unreadable'),
  };
}
