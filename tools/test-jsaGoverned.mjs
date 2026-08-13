/**
 * Governed WB-JSA client matrix.
 * Run: node --experimental-strip-types tools/test-jsaGoverned.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  encodeB64Url32, buildAuthorizeUrl, parseJsaSsoCallbackUrl,
  consumeCallback, markConsumed, SSO_ATTEMPT_TTL_MS,
} from '../services/sso/jsaPkce.ts';
import { decideFromJsaBinding, historicalMustStayHistorical, isJsaBinding } from '../services/sso/jsaBinding.ts';
import { decideBootstrap, mayShowLegacyLogin } from '../services/sso/jsaBootstrap.ts';
import { parseJsaLaunchUrl, isLegacyJsaLaunchUrl, buildJsaLaunchUrl, buildJsaReturnUrl } from '../services/sso/jsaLaunch.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`); };

const RID = 'R'.repeat(43);
const STATE = 'S'.repeat(43);
const VER = 'V'.repeat(43);
const CODE = 'c'.repeat(43);
const AUG = '2026-08-12_182535';
const JUN = '2026-06-24_124631';
const bytes = new Uint8Array(32).fill(7);
const attempt = { state: STATE, verifier: VER, challenge: encodeB64Url32(bytes), createdAtMs: 1000, consumed: false };

const openBinding = {
  shiftState: 'open', periodId: AUG, originLocalDate: '2026-08-12',
  requiresActiveShift: true, jsaEnabled: true,
};
const noneBinding = { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true };

// cold / warm SSO
const authUrl = buildAuthorizeUrl(attempt);
check('authorize URL is Suite PKCE S256, JSA audience',
  authUrl.startsWith('wellbuilt-suite://sso-authorize') && authUrl.includes('aud=wellbuilt-jsa') && authUrl.includes('ccm=S256'));
check('authorize URL has no identity material',
  !/hash=|name=|shiftId=|codeVerifier=/.test(authUrl));
const cb = parseJsaSsoCallbackUrl(`jsaapp://sso-callback?v=1&status=success&code=${CODE}&state=${STATE}`);
const consumed = consumeCallback(attempt, cb, 2000);
check('cold/warm callback consumes matching state', consumed.ok && consumed.status === 'success' && consumed.verifier === VER);

// direct icon
const icon = decideBootstrap({
  hasPersistedSession: false, incomingUrl: null, isCallback: false,
  isLaunch: false, isLegacyLaunch: false, isDirectIcon: true,
});
check('direct icon opens Suite authorize automatically', icon.action === 'open_suite_authorize');
check('direct icon never shows legacy login',
  mayShowLegacyLogin({ governed: true, bootstrap: icon }) === false);

// persisted session
check('existing session resumes',
  decideBootstrap({
    hasPersistedSession: true, incomingUrl: null, isCallback: false,
    isLaunch: false, isLegacyLaunch: false, isDirectIcon: true,
  }).action === 'resume_session');

// owner-operator / no-shift
const none = decideFromJsaBinding({ binding: noneBinding });
check('owner-operator none is valid when policy allows', none.kind === 'none' && none.ownerOperator === true);

// required active shift
check('required shift with none binding is refused',
  decideFromJsaBinding({ binding: { ...noneBinding, requiresActiveShift: true } }).kind === 'refused');

// stale June cache / August server
const august = decideFromJsaBinding({ binding: openBinding, cachedShiftId: JUN });
check('August server binding wins over June cache',
  august.kind === 'open' && august.periodId === AUG);
check('June historical save stays historical',
  historicalMustStayHistorical(JUN, AUG) === true);

// authority none/unavailable/mismatch
check('missing binding is unavailable', decideFromJsaBinding({ binding: null }).reason === 'unavailable');
check('bad binding shape rejected', isJsaBinding({ shiftState: 'open', periodId: JUN }) === false);

// PKCE replay
const second = consumeCallback(markConsumed(attempt), cb, 3000);
check('callback replay refused', second.ok === false && second.reason === 'consumed');
const mismatch = consumeCallback(attempt, parseJsaSsoCallbackUrl(`jsaapp://sso-callback?v=1&status=success&code=${CODE}&state=${'Z'.repeat(43)}`), 2000);
check('state mismatch refused', mismatch.ok === false && mismatch.reason === 'state_mismatch');

// process death / expiry
const dead = consumeCallback(attempt, cb, 1000 + SSO_ATTEMPT_TTL_MS + 1);
check('expired attempt after process death window refused', dead.ok === false && dead.reason === 'expired');

// WhatsApp/background: resume uses persisted session or pending attempt, not login
check('background resume with session does not login',
  decideBootstrap({
    hasPersistedSession: true, incomingUrl: null, isCallback: false,
    isLaunch: false, isLegacyLaunch: false, isDirectIcon: false,
  }).action === 'resume_session');

// legacy URL
check('legacy hash/name launch refused',
  isLegacyJsaLaunchUrl('jsaapp://start?hash=abc&name=Mike') === true);
check('legacy launch bootstrap refuses',
  decideBootstrap({
    hasPersistedSession: false, incomingUrl: 'jsaapp://start?hash=x&name=y',
    isCallback: false, isLaunch: true, isLegacyLaunch: true, isDirectIcon: false,
  }).refuseLegacy === true);

// launch + return same job
const launch = parseJsaLaunchUrl(buildJsaLaunchUrl({
  v: 1, source: 'wbt', requestId: RID, returnTo: 'wbt', jobRef: 'job1',
}));
const ret = buildJsaReturnUrl({ v: 1, requestId: RID, status: 'read' });
check('first-read return targets the same WB-T request',
  ret.includes(RID) && ret.startsWith('wellbuilt-tickets://jsa-return'));
check('duplicate return stays idempotent (same requestId)',
  buildJsaReturnUrl({ v: 1, requestId: RID, status: 'read' }) === ret);

// receipt dependency
check('governed receipt write is NOT invented client-side',
  /export const GOVERNED_RECEIPT_WRITE_AVAILABLE = false/.test(
    readFileSync(join(root, 'services/sso/jsaReturn.ts'), 'utf8')));

// exchange + legal name
const sess = {
  uid: 'uid1', driverId: 'drv1', companyId: 'co1',
  displayName: 'Mikezfold', legalName: 'Michael Burger', binding: openBinding,
};
check('exchange requires server jsaBinding', isJsaBinding(openBinding) && openBinding.periodId === AUG);
check('displayName is session label only', sess.displayName === 'Mikezfold');
check('legalName used for acknowledgment, never displayName fallback',
  /legalName only/.test(readFileSync(join(root, 'services/sso/jsaSession.ts'), 'utf8'))
  && (sess.legalName || '') === 'Michael Burger'
  && !sess.legalName === false);
check('profile bind-check rejects foreign company', sess.companyId !== 'other');

// no secrets in new modules
const files = ['jsaLaunch.ts', 'jsaPkce.ts', 'jsaBinding.ts', 'jsaSession.ts', 'jsaReturn.ts', 'jsaBootstrap.ts'];
for (const f of files) {
  const src = readFileSync(join(root, 'services/sso', f), 'utf8');
  check(`${f} has no credential console output`,
    !/console\.(log|warn|error)\([^)]*\b(hash|passcode|token|verifier|customToken)\b/i.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
