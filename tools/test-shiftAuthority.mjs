/**
 * Safety containment — a cached shift is never labeled active unless
 * authoritative resolution verifies it for the authenticated driver.
 *
 * Covers: verified active, stale cache, authority none, authority
 * unavailable, origin-day unverified, historical preservation, pending
 * request mismatch/missing shift, foreground/logout, no sensitive logs.
 *
 * Run: node --experimental-strip-types tools/test-shiftAuthority.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideShiftAuthority,
  decideGovernedReturnMark,
  decideUnauthenticatedOverlay,
  mayShowWelcomeModal,
  isExplicitShiftId,
  SHIFT_UNVERIFIED_COPY,
  CURRENT_SHIFT_VERIFIED_KEY,
  GOVERNED_RETURN_KEY,
} from '../services/shiftAuthority.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};
const src = (p) => readFileSync(join(root, p), 'utf8');

const LIVE = '2026-08-12_182535';
const STALE = '2026-06-24_124631';
const TODAY = {
  fetchOk: true, httpStatus: 200, currentShiftId: LIVE, explicitlyEnded: false,
};
const EMPTY_TODAY = {
  fetchOk: true, httpStatus: 404, currentShiftId: null, explicitlyEnded: false,
};
const base = {
  isAuthenticated: true,
  authenticatedDriverId: 'driver-1',
  authenticatedCompanyId: 'liquid-gold',
  cachedShiftId: STALE,
  today: EMPTY_TODAY,
  originVerdict: 'not_consulted',
  isGovernedLaunch: true,
  governedReturnRequired: false,
  pendingRequest: null,
};

// ── helpers ───────────────────────────────────────────────────────────────
check('explicit shift id accepted', isExplicitShiftId(LIVE));
check('bare calendar date is not a shift', !isExplicitShiftId('2026-08-13'));
check('fail-closed copy is the required wording',
  SHIFT_UNVERIFIED_COPY ===
    'Current WellBuilt shift could not be verified. Return to WellBuilt and try again.');

// ── verified active shift ─────────────────────────────────────────────────
{
  const d = decideShiftAuthority({ ...base, cachedShiftId: null, today: TODAY, originVerdict: 'not_consulted' });
  check('verified active: labeled active', d.mayLabelActive && d.activeShiftId === LIVE && d.kind === 'verified_active');
  check('verified active: Welcome allowed', d.mayShowWelcome && d.surface === 'jsa_content');
  check('verified active: keeps verified cache', d.currentCacheAction === 'keep_verified');
  check('verified active: history remains accessible', d.historicalAccessible === true);
}

// Overnight: today's 404 + origin-day still names the cache.
{
  const d = decideShiftAuthority({ ...base, cachedShiftId: STALE, originVerdict: 'verified_open' });
  check('overnight origin-day open is verified active',
    d.kind === 'verified_active' && d.mayLabelActive && d.activeShiftId === STALE);
}

// ── stale cached shift ────────────────────────────────────────────────────
{
  const d = decideShiftAuthority({ ...base, originVerdict: 'verified_closed' });
  check('stale cached: not labeled active', !d.mayLabelActive && d.kind === 'stale_cached');
  check('stale cached: current cache cleared', d.currentCacheAction === 'clear_current');
  check('stale cached: Welcome suppressed', !d.mayShowWelcome);
  check('stale cached: historical still accessible', d.historicalAccessible === true);
  check('stale cached + governed: fail-closed gate', d.surface === 'unverified_gate' && d.copy === SHIFT_UNVERIFIED_COPY);
}

// ── authority none ────────────────────────────────────────────────────────
{
  const d = decideShiftAuthority({
    ...base, cachedShiftId: null, originVerdict: 'not_consulted',
    isGovernedLaunch: false, pendingRequest: null,
  });
  check('authority none (standalone, authenticated): history only',
    d.kind === 'authority_none' && !d.mayLabelActive && d.surface === 'history_only');
  const gated = decideShiftAuthority({
    ...base, cachedShiftId: null, originVerdict: 'not_consulted',
  });
  check('authority none (governed): fail-closed gate',
    gated.kind === 'authority_none' && gated.surface === 'unverified_gate' && !gated.mayShowLegacyLogin);
}

// ── authority unavailable ─────────────────────────────────────────────────
{
  const d = decideShiftAuthority({
    ...base,
    today: { fetchOk: false, httpStatus: null, currentShiftId: null, explicitlyEnded: false },
  });
  check('authority unavailable: not labeled active', !d.mayLabelActive && d.kind === 'authority_unavailable');
  check('authority unavailable: does not preserve cache as current', d.currentCacheAction === 'clear_current');
  check('authority unavailable: fail-closed copy', d.surface === 'unverified_gate' && d.copy === SHIFT_UNVERIFIED_COPY);
}

// ── origin-day unverified ─────────────────────────────────────────────────
{
  const d = decideShiftAuthority({ ...base, originVerdict: 'unverified' });
  check('origin-day unverified: not labeled active', !d.mayLabelActive && d.kind === 'origin_day_unverified');
  check('origin-day unverified: cache cleared as current', d.currentCacheAction === 'clear_current');
  check('origin-day unverified: Welcome blocked', !d.mayShowWelcome);
  check('origin-day unverified: gate copy', d.copy === SHIFT_UNVERIFIED_COPY);
}

// ── historical submitted JSA preservation ─────────────────────────────────
{
  const d = decideShiftAuthority({ ...base, originVerdict: 'unverified' });
  check('historicalAccessible is always true', d.historicalAccessible === true);
  const auth = src('services/driverAuth.ts');
  const clearFn = auth.slice(auth.indexOf('export const clearDriverSession'),
    auth.indexOf('// --- Profile / Vehicle Info ---'));
  const removeList = clearFn.match(/multiRemove\(\[([\s\S]*?)\]/)?.[1] ?? '';
  check('logout/authority clear never deletes @jsa/saves', !removeList.includes('@jsa/saves'));
  check('logout/authority clear never deletes @jsa/activeJsas', !removeList.includes('@jsa/activeJsas'));
  check('store persist never writes historical keys',
    !/setItem\(\s*['"]@jsa\/saves['"]/.test(src('services/shiftAuthorityStore.ts')) &&
    !/removeItem\(\s*['"]@jsa\/saves['"]/.test(src('services/shiftAuthorityStore.ts')) &&
    !/setItem\(\s*['"]@jsa\/activeJsas['"]/.test(src('services/shiftAuthorityStore.ts')) &&
    !/removeItem\(\s*['"]@jsa\/activeJsas['"]/.test(src('services/shiftAuthorityStore.ts')));
}

// ── pending read request with mismatched / missing shift ──────────────────
{
  const missing = decideShiftAuthority({
    ...base, today: TODAY, cachedShiftId: null,
    pendingRequest: { requestShiftId: '2026-08-13', requestCompanyId: '', requestDriverId: 'driver-1' },
  });
  check('pending request + calendar-date shift fails closed',
    !missing.mayLabelActive && !missing.pendingRequestBound && missing.surface === 'unverified_gate');

  const mismatch = decideShiftAuthority({
    ...base, today: TODAY, cachedShiftId: null,
    pendingRequest: { requestShiftId: STALE, requestCompanyId: 'liquid-gold', requestDriverId: 'driver-1' },
  });
  check('pending request + mismatched shift fails closed',
    !mismatch.mayLabelActive && !mismatch.pendingRequestBound && mismatch.surface === 'unverified_gate');

  const emptyCo = decideShiftAuthority({
    ...base, today: TODAY, cachedShiftId: null,
    pendingRequest: { requestShiftId: LIVE, requestCompanyId: '', requestDriverId: 'driver-1' },
  });
  check('pending request + missing company binding fails closed',
    !emptyCo.pendingRequestBound && emptyCo.surface === 'unverified_gate');

  const bound = decideShiftAuthority({
    ...base, today: TODAY, cachedShiftId: null,
    pendingRequest: { requestShiftId: LIVE, requestCompanyId: 'liquid-gold', requestDriverId: 'driver-1' },
  });
  check('pending request bound to verified shift may proceed',
    bound.mayLabelActive && bound.pendingRequestBound && bound.surface === 'jsa_content');
}

// ── foreground / logout transition ────────────────────────────────────────
{
  const sso = decideGovernedReturnMark({ authMethod: 'sso', hasPendingRequest: false, returnTo: 'wbt' });
  check('SSO + WB-T return marks governed return to tickets', sso.mark && sso.returnTarget === 'wbt');
  const pending = decideGovernedReturnMark({ authMethod: null, hasPendingRequest: true, returnTo: null });
  check('pending request marks governed return', pending.mark === true);
  const standalone = decideGovernedReturnMark({ authMethod: null, hasPendingRequest: false, returnTo: null });
  check('standalone logout does not mark governed return', standalone.mark === false);

  check('governed leftover overlay is the gate, not login',
    decideUnauthenticatedOverlay({ governedReturnRequired: true, hasPendingRequest: false, isGovernedLaunch: false })
      === 'unverified_gate');
  check('icon-launch standalone overlay stays legacy login',
    decideUnauthenticatedOverlay({ governedReturnRequired: false, hasPendingRequest: false, isGovernedLaunch: false })
      === 'legacy_login');
  check('Welcome requires verified active',
    mayShowWelcomeModal({ isAuthenticated: true, mayLabelActive: false }) === false);
  check('Welcome allowed only when verified active',
    mayShowWelcomeModal({ isAuthenticated: true, mayLabelActive: true }) === true);
}

// ── no sensitive logs or URI output ───────────────────────────────────────
{
  const files = [
    'services/shiftAuthority.ts',
    'services/shiftAuthorityStore.ts',
    'components/ShiftAuthorityGate.tsx',
  ];
  const leak = /(console\.(log|warn|error|info|debug)\([^)]*\b(url|href|query|hash|passcode|token|requestId)\b)/i;
  for (const f of files) {
    check(`${f} has no sensitive console output`, !leak.test(src(f)));
  }
  const gate = src('components/ShiftAuthorityGate.tsx');
  check('return URLs are static schemes (no query interpolation)',
    /wellbuilt-tickets:\/\/resume/.test(gate) &&
    /wellbuilt-suite:\/\//.test(gate) &&
    !/openURL\([^)]*\+/.test(gate));
}

// ── wiring pins ───────────────────────────────────────────────────────────
{
  const idx = src('app/(tabs)/index.tsx');
  const layout = src('app/_layout.tsx');
  const authCtx = src('app/contexts/AuthContext.tsx');
  check('home refresh consults decideShiftAuthority', idx.includes('decideShiftAuthority'));
  check('home persist uses persistShiftAuthorityDecision', idx.includes('persistShiftAuthorityDecision'));
  check('persist marks verified only when the shift may be labeled active',
    /mayLabelActive[\s\S]*CURRENT_SHIFT_VERIFIED_KEY/.test(src('services/shiftAuthorityStore.ts')));
  check('active CTA requires mayLabelActive', /isSsoMode && mayLabelActive && !jsaCompletedToday/.test(idx));
  check('unverified card renders only from isolation, not raw authoritySurface',
    idx.includes('workflowIsolation.isolateOnly')
    && !/authoritySurface === 'unverified_gate' \|\| workflowIsolation\.isolateOnly/.test(idx));
  check('scope requires verified flag', idx.includes('isCurrentShiftVerified'));
  check('Welcome gated on verified shift', layout.includes('isCurrentShiftVerified'));
  check('unauth overlay can render the gate instead of LoginScreen',
    layout.includes("unauthSurface === 'unverified_gate'") && layout.includes('<LoginScreen'));
  check('logout uses the complete governed and legacy identity cleanup contract',
    authCtx.includes('logoutJsaCompletely') && !authCtx.includes('clearDriverSession'));
  check('verified / governed keys are distinct from historical saves',
    CURRENT_SHIFT_VERIFIED_KEY.startsWith('@jsa/') && GOVERNED_RETURN_KEY.startsWith('@jsa/'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
