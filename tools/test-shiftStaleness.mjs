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
// Ambiguity keeps the 4/28 protection.
expect(decideFromOriginDay(STALE, { readable: false }) === 'preserve',
  'unreadable origin day stays ambiguous → preserve (4/28 protection intact)');
expect(decideFromOriginDay(STALE, { readable: true }) === 'preserve',
  'origin day without the field stays ambiguous → preserve');

// ── Whole ambiguous-branch resolution ───────────────────────────────────────
{
  const calls = [];
  const fetchEnded = async (d) => { calls.push(d); return { readable: true, currentShiftId: '' }; };
  const r = await resolveCachedShift(STALE, TODAY, fetchEnded);
  expect(r.action === 'clear' && r.reason === 'origin_day_explicitly_ended',
    'FIELD CASE end-to-end: yesterday\'s closed shift is cleared');
  expect(calls.length === 1 && calls[0] === '2026-08-05',
    'the ORIGIN day is queried (not today) — that is where the closure lives');

  const sameDay = await resolveCachedShift('2026-08-06_060000', TODAY, async () => {
    throw new Error('must not be called');
  });
  expect(sameDay.action === 'preserve' && sameDay.reason === 'same_day_cache',
    'same-day caches never hit the network');

  const overnight = await resolveCachedShift(STALE, TODAY,
    async () => ({ readable: true, currentShiftId: STALE }));
  expect(overnight.action === 'preserve' && overnight.reason === 'origin_day_still_open',
    'overnight shifts survive the day boundary');

  const offline = await resolveCachedShift(STALE, TODAY, async () => { throw new Error('offline'); });
  expect(offline.action === 'preserve' && offline.reason === 'origin_day_unreadable',
    'offline/failed origin-day reads never destroy a live shift');

  const none = await resolveCachedShift(null, TODAY, async () => ({ readable: true }));
  expect(none.action === 'preserve' && none.reason === 'no_cached_shift', 'no cache, nothing to do');
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
  const amb = idx.slice(idx.indexOf('// Ambiguous server response'), idx.indexOf('wbDiagLog({', idx.indexOf('// Ambiguous server response')));
  expect(amb.includes("action === 'clear'") && amb.includes("removeItem('wellbuilt-current-shift-id')"),
    'a proven-closed prior-day shift is cleared from AsyncStorage');
  expect(amb.includes('preserving AsyncStorage'),
    'the genuinely ambiguous path still preserves (4/28 protection)');
}

console.log('shiftStaleness tests passed');
