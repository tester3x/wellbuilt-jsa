/**
 * vc51.7 — a closed prior-day shift must never remain "current".
 *
 * RED-FIRST against the 8/6 field defect: with no shift started today,
 * refreshShiftIdFromServer's today-only lookup 404s, the result is
 * classified "ambiguous", and the cached PRIOR-DAY shift id is preserved —
 * exactly what resurrected 2026-08-05_091221 (whose closure WB-S had
 * already recorded on its own day doc) and made WB-JSA present yesterday's
 * submitted JSA as the current-shift JSA.
 *
 * Field constants used below are the real observed values:
 *   cached id      2026-08-05_091221
 *   origin day doc driver_shifts/<hash>_2026-08-05 → currentShiftId = ""
 *   today          2026-08-06 (no driver_shifts doc → 404)
 *
 * Run: node --experimental-strip-types tools/test-shiftStaleness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  shiftDateOf,
  needsOriginDayCheck,
  decideFromOriginDay,
  verifyCachedShift,
  resolveCachedShift,
} from '../services/shiftStaleness.ts';

function expect(cond, msg) { if (!cond) throw new Error(msg); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const STALE = '2026-08-05_091221';
const TODAY = '2026-08-06';

// ── Date extraction / trigger ───────────────────────────────────────────────
expect(shiftDateOf(STALE) === '2026-08-05', 'date prefix parsed from a shift id');
expect(shiftDateOf('2026-08-06') === '2026-08-06', 'bare-date scope ids parse too');
expect(shiftDateOf('') === null && shiftDateOf(null) === null && shiftDateOf('garbage') === null,
  'unparseable ids yield no date');
expect(needsOriginDayCheck(STALE, TODAY), 'a prior-day cached id must be verified');
expect(!needsOriginDayCheck('2026-08-06_060000', TODAY), 'same-day ids are left alone');
expect(!needsOriginDayCheck('2026-08-07_060000', TODAY), 'future-dated ids are not treated as stale');
expect(!needsOriginDayCheck(null, TODAY) && !needsOriginDayCheck(STALE, 'nonsense'),
  'missing inputs never trigger a network check');

// ── Origin-day verdicts ─────────────────────────────────────────────────────
// THE FIELD CASE: WB-S wrote currentShiftId = "" at logout → must clear.
expect(decideFromOriginDay(STALE, { readable: true, currentShiftId: '' }) === 'clear',
  'FIELD CASE: an explicitly ended shift is cleared, never preserved');
// Overnight shift still running — the boundary is NOT midnight.
expect(decideFromOriginDay(STALE, { readable: true, currentShiftId: STALE }) === 'preserve',
  'an overnight shift still open on its origin day is preserved');
// Superseded by a newer shift.
expect(decideFromOriginDay(STALE, { readable: true, currentShiftId: '2026-08-06_060000' }) === 'clear',
  'a superseded shift is cleared');
// Unverified origin day must not keep the cache as current.
expect(decideFromOriginDay(STALE, { readable: false }) === 'clear',
  'unreadable origin day is cleared as current (not labeled active)');
expect(decideFromOriginDay(STALE, { readable: true }) === 'clear',
  'origin day without the field is cleared as current');

// ── Whole ambiguous-branch resolution ───────────────────────────────────────
{
  const calls = [];
  const fetchEnded = async (d) => { calls.push(d); return { readable: true, currentShiftId: '' }; };
  const r = await resolveCachedShift(STALE, TODAY, fetchEnded);
  expect(r.action === 'clear' && r.reason === 'origin_day_explicitly_ended',
    'FIELD CASE end-to-end: yesterday\'s closed shift is cleared');
  expect(calls.length === 1 && calls[0] === '2026-08-05',
    'the ORIGIN day is queried (not today) — that is where the closure lives');

  // vc51.8 SAME-DAY CLOSE (the gap 3eaf7e7 left): a shift that opened AND
  // closed today, with the logout signal missed, must NOT stay current
  // merely because its date equals today.
  const sameDayClosed = await resolveCachedShift('2026-08-06_060000', TODAY,
    async () => ({ readable: true, currentShiftId: '' }));
  expect(sameDayClosed.action === 'clear' && sameDayClosed.verdict === 'verified_closed',
    'SAME-DAY CLOSE: a closed same-day shift is cleared, not preserved by date');
  const sameDayOpen = await resolveCachedShift('2026-08-06_060000', TODAY,
    async () => ({ readable: true, currentShiftId: '2026-08-06_060000' }));
  expect(sameDayOpen.action === 'preserve' && sameDayOpen.verdict === 'verified_open',
    'a genuinely open same-day shift stays current');
  const sameDaySuperseded = await resolveCachedShift('2026-08-06_060000', TODAY,
    async () => ({ readable: true, currentShiftId: '2026-08-06_143000' }));
  expect(sameDaySuperseded.action === 'clear',
    'a same-day shift superseded by a later shift is cleared');

  const overnight = await resolveCachedShift(STALE, TODAY,
    async () => ({ readable: true, currentShiftId: STALE }));
  expect(overnight.action === 'preserve' && overnight.reason === 'origin_day_still_open',
    'overnight shifts survive the day boundary');

  const offline = await resolveCachedShift(STALE, TODAY, async () => { throw new Error('offline'); });
  expect(offline.action === 'clear' && offline.verdict === 'unverified',
    'offline/failed origin-day reads stay unverified and are not preserved as current');

  const none = await resolveCachedShift(null, TODAY, async () => ({ readable: true }));
  expect(none.action === 'preserve' && none.reason === 'no_cached_shift', 'no cache, nothing to do');
}

// ── Verification verdicts (request-bound flows consult these) ───────────────
{
  expect(verifyCachedShift(STALE, { readable: true, currentShiftId: STALE }) === 'verified_open',
    'named by its origin day → verified_open');
  expect(verifyCachedShift(STALE, { readable: true, currentShiftId: '' }) === 'verified_closed',
    'explicitly ended → verified_closed');
  expect(verifyCachedShift(STALE, { readable: true, currentShiftId: 'other' }) === 'verified_closed',
    'superseded → verified_closed');
  // UNVERIFIED is never an implicit licence to proceed — offline/unreadable
  // must be distinguishable so request-bound completion can fail closed.
  expect(verifyCachedShift(STALE, { readable: false }) === 'unverified',
    'unreadable origin day → unverified (never silently open)');
  expect(verifyCachedShift(STALE, { readable: true }) === 'unverified',
    'missing field → unverified');
  expect(verifyCachedShift(null, { readable: true, currentShiftId: 'x' }) === 'verified_closed',
    'no cached shift is not an open period');
  const offlineRes = await resolveCachedShift(STALE, TODAY, async () => { throw new Error('offline'); });
  expect(offlineRes.verdict === 'unverified' && offlineRes.action === 'clear',
    'offline resolution surfaces unverified and clears the current-shift hint');
}

// No invented boundary anywhere: the module must not encode hour windows.
{
  const src = readFileSync(join(root, 'services/shiftStaleness.ts'), 'utf8');
  expect(!/\b(12|14)\s*\*\s*60|hoursSince|MAX_SHIFT_HOURS/.test(src),
    'no fixed 12/14-hour shift assumption is introduced');
}

// ── Wiring pin: the ambiguous branch consults the origin day ────────────────
{
  const idx = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');
  expect(idx.includes('resolveCachedShift'),
    'refreshShiftIdFromServer resolves prior-day caches through the shared decision');
  expect(idx.includes('decideShiftAuthority') && idx.includes('persistShiftAuthorityDecision'),
    'refresh applies the fail-closed authority decision (unverified is not preserved as current)');
}

console.log('shiftStaleness tests passed');
