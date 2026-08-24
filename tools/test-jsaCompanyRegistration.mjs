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
check('independent registration is unavailable without a governed no-company contract',
  !/export const registerStandalone/.test(auth)
    && /Independent registration is temporarily unavailable/.test(login));
check(
  'helper calls requestDriverRegistration',
  /callHttpsFunction[\s\S]*'requestDriverRegistration'/.test(auth)
    || /'requestDriverRegistration'/.test(auth),
);
check('source marker is wbjsa', /source:\s*'wbjsa'/.test(auth));
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
check(
  'completeRegistration does not saveDriverSession',
  /export const completeRegistration[\s\S]*Please sign in/.test(auth)
    && !/export const completeRegistration[\s\S]*saveDriverSession/.test(auth),
);
check(
  'AuthContext company register does not call isPasscodeAvailable',
  !/const register =[\s\S]*isPasscodeAvailable/.test(ctx),
);
check(
  'AuthContext approval goes to login, not authenticated',
  /Registration approved\. Please sign in/.test(ctx)
    && !/completeRegistration\(\)/.test(ctx),
);
check(
  'no auto-approved standalone claim',
  !/— auto-approved/.test(ctx + login) && !/registerStandalone/.test(ctx),
);
check(
  'five-character passcode rejected in helper',
  /JSA_PASSCODE_MIN_LEN = 6/.test(auth) && /Passcode must be 6/.test(auth + login),
);
check('LoginScreen company submit uses register()', /handleRegister[\s\S]*await register\(/.test(login));
check('LoginScreen makes no false independent registration promise',
  !/handleStandaloneRegister|registerStandalone/.test(login));

// Pins refreshed against Codex-approved governed source bc961573e12f0de789827b529b38d606d4be7173.
const frozen = {
  'services/sso/jsaArtifactCallables.ts': '127f909e5d7b38a5b830152c2d66f0e1919dfa9adc132a92bef05e1cdbbb8a32',
  'services/sso/jsaArtifactSnapshot.ts': '86132e9d0ce5e5cfee23e3061dc1e1ff6e5fe4338e2769ce3b4c60b1804872f6',
  'services/sso/jsaRequestCallables.ts': '4dd637a900d74f653272402d8cbd7836d34ebf386bfc2cee1d158a9360fb542c',
  'services/sso/jsaRequestLifecycle.ts': 'd140338069b96c5e251573604ffec6bd20f06c844300522db4eedb6a7d7473b5',
  'tools/test-jsaRequestLifecycle.mjs': '324edb75d6ff8c9747183946e3c2e7f46b32dceb19e0eb5f0374da80d6885d27',
};
for (const [rel, want] of Object.entries(frozen)) {
  check(`protected ${rel} freeze hash`, sha256(rel) === want, sha256(rel));
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
