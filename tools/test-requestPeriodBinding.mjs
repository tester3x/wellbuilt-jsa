/**
 * vc51.9B — canonical request-period binding matrix. The validator and
 * resolver are driven with injected evidence; every period verdict comes
 * from @tester3x/wellbuilt-contracts, never local math.
 *
 * Run: node --experimental-strip-types tools/test-requestPeriodBinding.mjs
 */
import {
  resolveSubmissionPeriod, validateRequestPeriodBinding,
} from '../services/requestPeriodBinding.ts';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};

const NOW = Date.parse('2026-08-06T15:00:00.000Z');
const SESSION = { companyId: 'liquid-gold', driverHash: 'hash-1' };
const OPEN = {
  outcome: 'ACTIVE_EXPLICIT_SHIFT', contractVersion: 1, companyId: 'liquid-gold',
  driverId: 'hash-1', mode: 'explicit_shift', periodId: '2026-08-06_060000',
  startIso: null, endIso: null, timezone: 'America/Chicago',
  source: 'authoritative_today', verifiedAtIso: new Date(NOW).toISOString(),
};
const v2 = (extra = {}) => ({
  receiptVersion: 2, contractVersion: 1, companyId: 'liquid-gold',
  driverHash: 'hash-1', periodId: '2026-08-06_060000', workPeriodMode: 'explicit_shift', ...extra,
});

// v1 legacy inert path.
check('v1 request stays legacy (inert)',
  validateRequestPeriodBinding({ receiptVersion: 1, companyId: 'x', driverHash: 'y' }, SESSION, null).ok === true);

// v2 full proof.
{
  const r = validateRequestPeriodBinding(v2(), SESSION, OPEN);
  check('v2 with matching open period binds',
    r.ok === true && r.receiptVersion === 2 && r.submissionPeriodId === '2026-08-06_060000'
    && r.workPeriodMode === 'explicit_shift');
}
const denies = (name, req, res, reason) => {
  const r = validateRequestPeriodBinding(req, SESSION, res);
  check(name, r.ok === false && r.reason === reason, r.ok ? 'bound' : r.reason);
};
denies('unsupported contract version refused', v2({ contractVersion: 99 }), OPEN, 'unsupported_contract_version');
denies('company mismatch refused', v2({ companyId: 'other-co' }), OPEN, 'company_mismatch');
denies('driver mismatch refused', v2({ driverHash: 'hash-2' }), OPEN, 'driver_mismatch');
denies('missing request period refused', v2({ periodId: null }), OPEN, 'missing_request_period');
denies('unverified/offline resolution never binds', v2(), { ...OPEN, outcome: 'UNVERIFIED_OFFLINE', reason: 'x' }, 'period_unverified');
denies('null resolution never binds', v2(), null, 'period_unverified');
denies('closed/superseded period refused', v2(),
  { outcome: 'CLOSED_OR_SUPERSEDED', contractVersion: 1, companyId: 'liquid-gold', driverId: 'hash-1', mode: 'explicit_shift', closedPeriodId: '2026-08-06_060000', reason: 'ended' }, 'period_not_open');
denies('no active shift refused', v2(),
  { outcome: 'NO_ACTIVE_SHIFT', contractVersion: 1, companyId: 'liquid-gold', driverId: 'hash-1', mode: 'explicit_shift', reason: 'none' }, 'period_not_open');
denies('period mismatch refused (prior period never bootstraps)',
  v2({ periodId: '2026-08-05_060000' }), OPEN, 'period_mismatch');
denies('mode mismatch refused', v2({ workPeriodMode: 'company_defined_period' }), OPEN, 'mode_mismatch');

// Resolver: explicit mode via authoritative day docs (canonical package).
{
  const r = await resolveSubmissionPeriod({
    companyId: 'liquid-gold', driverHash: 'hash-1', mode: 'explicit_shift',
    nowMs: NOW, localDate: '2026-08-06',
    fetchDayDoc: async () => ({ readable: true, present: true, currentShiftId: '2026-08-06_060000' }),
  });
  check('resolver: open explicit shift resolves through the package',
    r.outcome === 'ACTIVE_EXPLICIT_SHIFT' && r.periodId === '2026-08-06_060000');
}
{
  // Overnight: cached prior-day shift verified against its ORIGIN day.
  const docs = {
    '2026-08-06': { readable: true, present: false },
    '2026-08-05': { readable: true, present: true, currentShiftId: '2026-08-05_180000' },
  };
  const r = await resolveSubmissionPeriod({
    companyId: 'liquid-gold', driverHash: 'hash-1', mode: 'explicit_shift',
    nowMs: NOW, localDate: '2026-08-06', cachedShiftId: '2026-08-05_180000',
    fetchDayDoc: async (d) => docs[d] ?? { readable: false, present: false },
  });
  check('resolver: overnight cached shift verified via origin day',
    r.outcome === 'ACTIVE_EXPLICIT_SHIFT' && r.periodId === '2026-08-05_180000'
    && r.source === 'authoritative_origin_day');
}
{
  const r = await resolveSubmissionPeriod({
    companyId: 'liquid-gold', driverHash: 'hash-1', mode: 'explicit_shift',
    nowMs: NOW, localDate: '2026-08-06',
    fetchDayDoc: async () => ({ readable: false, present: false }),
  });
  check('resolver: unreadable evidence → UNVERIFIED_OFFLINE (fail closed)',
    r.outcome === 'UNVERIFIED_OFFLINE');
}
{
  const r = await resolveSubmissionPeriod({
    companyId: 'liquid-gold', driverHash: 'hash-1', mode: 'company_defined_period',
    nowMs: Date.parse('2026-08-06T16:00:00.000Z'), localDate: '2026-08-06',
    fetchDayDoc: async () => { throw new Error('not used in derived mode'); },
    derivedConfig: { timezone: 'America/Chicago', startLocalTime: '06:00', durationMinutes: 720 },
  });
  check('resolver: derived mode resolves from configuration',
    r.outcome === 'CURRENT_DERIVED_PERIOD' && r.periodId === '2026-08-06_0600');
}
{
  const r = await resolveSubmissionPeriod({
    companyId: 'liquid-gold', driverHash: 'hash-1', mode: 'company_defined_period',
    nowMs: NOW, localDate: '2026-08-06',
    fetchDayDoc: async () => ({ readable: true, present: false }),
    derivedConfig: { timezone: 'Mars/Olympus', startLocalTime: '06:00', durationMinutes: 720 },
  });
  check('resolver: invalid derived config fails honestly (no fallback)',
    r.outcome === 'INVALID_CONFIGURATION');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
