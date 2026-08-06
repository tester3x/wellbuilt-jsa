/**
 * vc51.9B — request-aware auto-navigation matrix (red-first: the wiring
 * pins fail until index.tsx consults the pure decision and the verdict).
 *
 * Run: node --experimental-strip-types tools/test-jsaAutoNav.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideAutoNavigation, currentJsaBannerLabel, HISTORICAL_JSA_LABEL,
} from '../services/jsaAutoNav.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const base = {
  pendingRequestUsable: false, verdict: 'server_open', saveExists: true,
  saveShiftId: 'S1', currentShiftId: 'S1', isSsoMode: true,
};
const d = (over) => decideAutoNavigation({ ...base, ...over });

// ── verified current matches open ─────────────────────────────────────────
check('verified open + matching shift → open as current', d({}).action === 'open_current');
check('origin-day verified open (overnight) also current',
  d({ verdict: 'verified_open' }).action === 'open_current');

// ── prior/mismatched records never masquerade ─────────────────────────────
check('open shift but record from ANOTHER shift → suppress',
  d({ saveShiftId: 'S0' }).action === 'suppress');
check('server-ended shift → suppress (prior record is historical)',
  d({ verdict: 'server_ended' }).action === 'suppress' && d({ verdict: 'server_ended' }).reason === 'period_closed');
check('origin-day closed/superseded → suppress',
  d({ verdict: 'verified_closed' }).action === 'suppress');
check('no verdict → suppress', d({ verdict: 'none' }).action === 'suppress');

// ── unverified NEVER opens stale detail ───────────────────────────────────
check('unverified without request → suppress, not open, not closed-claim',
  d({ verdict: 'unverified' }).action === 'suppress' && d({ verdict: 'unverified' }).reason === 'period_unverified');
check('unverified WITH pending request → bounded blocked state',
  d({ verdict: 'unverified', pendingRequestUsable: true }).action === 'blocked');

// ── pending request behavior ─────────────────────────────────────────────
check('pending request + record in verified invoking period → open as current',
  d({ pendingRequestUsable: true }).action === 'open_current');
check('pending request + prior-period record → suppress (request flow wins)',
  d({ pendingRequestUsable: true, saveShiftId: 'S0' }).action === 'suppress');
check('pending request + closed period → suppress',
  d({ pendingRequestUsable: true, verdict: 'verified_closed' }).action === 'suppress');

// ── standalone/legacy preserved ───────────────────────────────────────────
check('standalone date-scoped record keeps legacy auto-open (inert)',
  d({ isSsoMode: false, saveShiftId: null, currentShiftId: null, verdict: 'none' }).action === 'open_current');
check('no record → suppress', d({ saveExists: false }).action === 'suppress');

// ── labels ────────────────────────────────────────────────────────────────
check('explicit-shift label', currentJsaBannerLabel('explicit_shift') === 'View Current Shift JSA');
check('derived-period label', currentJsaBannerLabel('company_defined_period') === 'View Current Work Period JSA');
check('historical label distinct', HISTORICAL_JSA_LABEL === 'View Previous JSA');

// ── wiring pins (red until index.tsx consumes the decision) ───────────────
const idx = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');
check('auto-route consults decideAutoNavigation', idx.includes('decideAutoNavigation'));
check('refresh captures the typed verdict (not only .action)',
  /setShiftVerdict|shiftVerdictRef/.test(idx));
check('auto-route no longer opens unconditionally on todaysJsaSave',
  !/if \(todaysJsaSave\) \{\s*\n\s*autoRoutedRef\.current = true;/.test(idx));
check('banner uses verified-current gating for the Current label',
  idx.includes('HISTORICAL_JSA_LABEL') || idx.includes('View Previous JSA'));
const viewJsa = readFileSync(join(root, 'app/viewJsa.tsx'), 'utf8');
check('viewJsa displays the record’s saved date (historical honesty)',
  /savedAt|Saved on|historical/.test(viewJsa));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
