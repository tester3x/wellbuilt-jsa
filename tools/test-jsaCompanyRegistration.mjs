/**
 * JSA C3 company-registration source inventory.
 * Run: node tools/test-jsaCompanyRegistration.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const auth = readFileSync(join(ROOT, 'services', 'driverAuth.ts'), 'utf8');
const ctx = readFileSync(join(ROOT, 'app', 'contexts', 'AuthContext.tsx'), 'utf8');
const login = readFileSync(join(ROOT, 'components', 'LoginScreen.tsx'), 'utf8');
const contract = readFileSync(join(ROOT, 'services', 'jsaRegistrationContract.ts'), 'utf8');
const back = readFileSync(join(ROOT, 'components', 'registrationBack.ts'), 'utf8');
const registerBlock = ctx.slice(ctx.indexOf('const register ='), ctx.indexOf('const cancelRegistration ='));
let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

function normalizedSha256Text(text) {
  return createHash('sha256').update(text.replace(/\r\n|\r/g, '\n'), 'utf8').digest('hex');
}

function sha256(rel) {
  return normalizedSha256Text(readFileSync(join(ROOT, rel), 'utf8'));
}

check('normalized hash treats LF and CRLF text identically',
  normalizedSha256Text('alpha\nbeta\n') === normalizedSha256Text('alpha\r\nbeta\r\n'));

check(
  'primary submitRegistration uses requestDriverRegistration helper',
  /export const submitRegistration[\s\S]*requestPendingRegistration/.test(auth),
);
check('registration stays on the governed pending contract',
  !/export const registerStandalone/.test(auth)
    && !/Independent registration is temporarily unavailable/.test(login));
check(
  'helper calls requestDriverRegistration',
  /callHttpsFunction[\s\S]*'requestDriverRegistration'/.test(auth)
    || /'requestDriverRegistration'/.test(auth),
);
check('source marker is wbjsa', /JSA_REGISTRATION_SOURCE\s*=\s*'wbjsa'/.test(contract));
check('payload carries companyCode', /companyCode:\s*uppercaseCompanyCodeInput/.test(contract));
check('payload never carries companyName', !/companyName/.test(contract));
check('registration adapter requires companyCode',
  /requestPendingRegistration\(params:[\s\S]*companyCode:\s*string/.test(auth)
    && /companyCode:\s*params\.companyCode/.test(auth));
check('join code is not persisted on the device',
  !/setItemAsync\([^)]*pendingCompanyCode/.test(auth)
    && !/setItemAsync\([^)]*pendingCompanyName/.test(auth));
check('no firebasePost function', !/const firebasePost/.test(auth) && !/firebasePost\(/.test(auth));
check(
  'no reachable client POST to drivers/pending',
  !/firebasePost\(\s*DRIVERS_PENDING/.test(auth)
    && !/fetch\([^)]*drivers\/pending/.test(auth + ctx + login),
);
check(
  'does not write jsa_pendingPasscodeHash',
  !/setItemAsync\(\s*['"]jsa_pendingPasscodeHash['"]/.test(auth),
);
check(
  'stores jsa_pendingSecureId',
  /setItemAsync\(\s*'jsa_pendingSecureId'/.test(auth),
);
check('no approval completion helper can create a session',
  !/completeRegistration|completeReg/.test(auth + ctx + login));
check(
  'AuthContext company register does not call isPasscodeAvailable',
  !/const register =[\s\S]*isPasscodeAvailable/.test(ctx),
);
check(
  'AuthContext approval goes to login, not authenticated',
  /Registration approved\. Please sign in/.test(ctx)
    && !/completeRegistration\(\)/.test(ctx),
);
check('approval clears local pending state before Sign In',
  (ctx.match(/await clearPendingRegistration\(\)/g) || []).length >= 4);
check('no dormant approved screen can enter the app',
  !/mode === "approved"/.test(login) && !/\| "approved"/.test(ctx));
check('successful registration remains pending and creates no session',
  /if \(result\.success\)[\s\S]*setMode\("pending"\)/.test(registerBlock)
    && !/setSession\(/.test(registerBlock));
check('registration accepts only a governed pending response',
  /pendingRegistrationIdFromResponse\(result\)/.test(auth)
    && /status !== 'pending'/.test(contract));
check('registration secrets leave component state after successful submission',
  /if \(await register\([\s\S]*setPasscode\(""\)[\s\S]*setLegalName\(""\)[\s\S]*setCompanyCode\(""\)[\s\S]*setShowPasscode\(false\)/.test(login));
check('pending exit is accurately labeled as a return to Sign In',
  /mode === "pending"[\s\S]*t\('Return to Sign In'\)/.test(login)
    && !/t\('Cancel registration'\)/.test(login));
check('expired or missing pending request returns to Sign In',
  /status === "none"[\s\S]*clearPendingRegistration\(\)[\s\S]*setMode\("login"\)/.test(ctx));
check('polling is serialized and stale responses are gated',
  /guard\.tryStart\(generation\)/.test(ctx)
    && (ctx.match(/guard\.isCurrent\(generation\)/g) || []).length >= 3
    && /registrationPollGuardRef\.current\.invalidate\(\)/.test(ctx));
check('terminal cleanup failure leaves the polling timer available to retry',
  /status === "approved"[\s\S]*await clearPendingRegistration\(\)[\s\S]*stopTimer\(\)/.test(ctx)
    && /status === "none"[\s\S]*await clearPendingRegistration\(\)[\s\S]*stopTimer\(\)/.test(ctx));
check('pending Return reaches Sign In even when local cleanup fails',
  /const cancelRegistration[\s\S]*setMode\("login"\)[\s\S]*try \{[\s\S]*await clearPendingRegistration\(\)[\s\S]*catch/.test(ctx));
check('registration mutations are bound to the current identity attempt',
  /const registrationAttempt = \+\+registrationAttemptRef\.current/.test(registerBlock)
    && /identityRead === identityReadRef\.current/.test(registerBlock)
    && /if \(!isCurrent\(\)\) return false/.test(registerBlock));
check('governed identity refresh synchronously invalidates registration polling',
  /const checkInitialState = async \(\) => \{[\s\S]*registrationPollGuardRef\.current\.invalidate\(\)[\s\S]*\+\+identityReadRef\.current/.test(ctx));
check(
  'no auto-approved standalone claim',
  !/— auto-approved/.test(ctx + login) && !/registerStandalone/.test(ctx),
);
check(
  'five-character passcode rejected in helper',
  /JSA_PASSCODE_MIN_LEN = 6/.test(auth) && /Passcode must be 6/.test(auth + login),
);
check('LoginScreen company submit uses register()', /handleRegister[\s\S]*await register\(/.test(login));
check('legal name is optional in the registration gate',
  /displayName\.trim\(\)\s*&&\s*companyCode\.trim\(\)/.test(login)
    && !/displayName\.trim\(\)\s*&&\s*legalName\.trim\(\)/.test(login));
check('join-code input uppercases while preserving backend normalization',
  /setCompanyCode\(uppercaseCompanyCodeInput\(value\)\)/.test(login)
    && /autoCapitalize="characters"/.test(login));
check('Android hardware Back uses the shared registration decision',
  /BackHandler\.addEventListener\('hardwareBackPress'/.test(login)
    && /registrationBackAction\(mode, keyboardVisibleRef\.current\)/.test(login)
    && /return_to_sign_in/.test(back));
check('register form has a direct return to Sign In',
  /accessibilityLabel=\{t\('Return to Sign In'\)\}/.test(login)
    && /onPress=\{handleSwitchToLogin\}/.test(login));
check('LoginScreen makes no false independent registration promise',
  !/handleStandaloneRegister|registerStandalone/.test(login));

// Pins refreshed against Codex-approved governed source bc961573e12f0de789827b529b38d606d4be7173.
const frozen = {
  'services/sso/jsaArtifactCallables.ts': '127f909e5d7b38a5b830152c2d66f0e1919dfa9adc132a92bef05e1cdbbb8a32',
  'services/sso/jsaArtifactSnapshot.ts': '86132e9d0ce5e5cfee23e3061dc1e1ff6e5fe4338e2769ce3b4c60b1804872f6',
  'services/sso/jsaRequestCallables.ts': '4dd637a900d74f653272402d8cbd7836d34ebf386bfc2cee1d158a9360fb542c',
  'services/sso/jsaRequestLifecycle.ts': '04978ae1fa34510c6a92a917e6c6d0fee71203fd0cf49795ae429df887042e02',
  'tools/test-jsaRequestLifecycle.mjs': '02cbcfcb585a01cb6f5267ca7685232c078e691c8c70352e35a24c6cef05e630',
  'components/SignaturePad.tsx': '19530309e105def83976aad4689c158724771f40cbc92edb2a18f7a96ef2412b',
  'services/sso/jsaCanonicalProfile.ts': '94e6939824e17b3ee490c2f39c680893ec29425f0f6e0604577d4b8212038451',
  'services/sso/jsaIdentityContract.ts': '7a0f61bb6cf112da2b7989734341c5a60fb2c44ac42081767fc818aa8044f4e2',
  'services/jsaRecord.ts': 'bcea5c34265a501b74b5e2d5c04d1fa836fdd68e88f1ebbdfaad5c440c311934',
  'services/jsaDocument.ts': 'dcd3fb05b07a35f09b15491185697d7d5acc0bad45a31e5ffe301aa5c96c7de5',
};
for (const [rel, want] of Object.entries(frozen)) {
  check(`protected ${rel} freeze hash`, sha256(rel) === want, sha256(rel));
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
