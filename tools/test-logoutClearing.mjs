/**
 * vc51.9B — verified-logout cache clearing (defence in depth on top of
 * the reviewed stale-shift commits, which are preserved untouched).
 *
 * RED-FIRST: before the fix, clearDriverSession wiped SecureStore only —
 * `wellbuilt-current-shift-id` and the pending `@jsa/wbtReadRequest`
 * survived logout and could leak a prior driver's period into the next
 * session. The fix clears the period/pending-request cache on VERIFIED
 * logout only (real logout flows call clearDriverSession; ambiguous
 * network failures never do), while saved/historical JSAs stay.
 *
 * Run: node tools/test-logoutClearing.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
};

const auth = src('services/driverAuth.ts');
const clearFn = auth.slice(auth.indexOf('export const clearDriverSession'),
  auth.indexOf('// --- Profile / Vehicle Info ---'));

// ── the verified-logout clear set ─────────────────────────────────────────
check('logout clears the cached current shift id',
  clearFn.includes("'wellbuilt-current-shift-id'") || clearFn.includes('"wellbuilt-current-shift-id"'));
check('logout clears the verified-current flag (not historical saves)',
  clearFn.includes('@jsa/currentShiftVerified') && !clearFn.includes('@jsa/governedReturnRequired'));
check('logout clears the pending WB-T read request',
  clearFn.includes('@jsa/wbtReadRequest'));
check('logout clears pending current-period UI state (autofill/returnTo/resume)',
  clearFn.includes('jsa_autofill') && clearFn.includes('jsa_returnTo') && clearFn.includes('jsa_resume'));
check('logout clears the fresh governed submitted marker and launch nav state',
  clearFn.includes('@jsa/freshGovernedSubmitted')
  && clearFn.includes('@jsa/governedLaunchContext')
  && clearFn.includes('@jsa/governedLaunchOwnership')
  && clearFn.includes('@jsa/governedUiStage'));
{
  const removeList = clearFn.match(/multiRemove\(\[([\s\S]*?)\]/)?.[1] ?? '';
  check('logout does NOT erase saved/historical JSAs (multiRemove list excludes them)',
    removeList.length > 0 && !removeList.includes('@jsa/saves') && !removeList.includes('@jsa/activeJsas'));
}
check('logout does NOT nuke all storage',
  !/AsyncStorage\.clear\(\)/.test(clearFn));

// ── only VERIFIED logout paths reach the clear ────────────────────────────
const layout = src('app/_layout.tsx');
const authCtx = src('app/contexts/AuthContext.tsx');
check('AuthContext.logout routes through clearDriverSession',
  /clearDriverSession\(\)/.test(authCtx));
check('RTDB logoutAt cascade routes through the same logout (authoritative signal)',
  /checkRtdbLogoutSignal/.test(layout) && /logout\(\)/.test(layout));
check('ambiguous logoutAt fetch failures do NOT clear (baseline preserved on error)',
  /catch/.test(layout.slice(layout.indexOf('checkRtdbLogoutSignal'), layout.indexOf('checkRtdbLogoutSignal') + 1600)));
check('an unreadable shift is not preserved as current (resolver clears)',
  /action: 'clear'[\s\S]*origin_day_unverified/.test(src('services/shiftStaleness.ts')));
check('logout captures governed-return so the next overlay is not legacy login',
  src('app/contexts/AuthContext.tsx').includes('captureGovernedReturnBeforeLogout'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
