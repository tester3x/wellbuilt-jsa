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

function sha256(rel) {
  const buf = readFileSync(join(ROOT, rel));
  return createHash('sha256').update(buf).digest('hex');
}

check(
  'primary submitRegistration uses requestDriverRegistration helper',
  /export const submitRegistration[\s\S]*requestPendingRegistration/.test(auth),
);
check(
  'independent registerStandalone uses the same helper',
  /export const registerStandalone[\s\S]*requestPendingRegistration/.test(auth),
);
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
  !/— auto-approved/.test(ctx + login) && /never auto-approved|pending-only/.test(ctx),
);
check(
  'five-character passcode rejected in helper',
  /JSA_PASSCODE_MIN_LEN = 6/.test(auth) && /Passcode must be 6/.test(auth + login),
);
check('LoginScreen company submit uses register()', /handleRegister[\s\S]*await register\(/.test(login));
check(
  'LoginScreen independent uses registerStandalone()',
  /handleStandaloneRegister[\s\S]*await registerStandalone\(/.test(login),
);

// Pins refreshed against Codex-approved governed source bc961573e12f0de789827b529b38d606d4be7173.
const frozen = {
  'services/sso/jsaArtifactCallables.ts': '94ba3b59b156576778b26decd8449a655776a6ba759768ad4b63f89cf7673624',
  'services/sso/jsaArtifactSnapshot.ts': '72fc4d97fd00016f539e630b004820ceea30ba1e5763bef1cf8d2c584e1a607d',
  'services/sso/jsaRequestCallables.ts': 'fa0b593b7a4bde78d121686eb269739270e9e0dfdb09ededccd6e1d33e3508ab',
  'services/sso/jsaRequestLifecycle.ts': '15a4781f7dc72c3198774547ce13e4a6c9ffb59944d485bbc092955b936bcb0b',
  'tools/test-jsaRequestLifecycle.mjs': '9e3d7ce3121bd67dce48d2d43181a67618ad799c46e912421da206f0e480e081',
};
for (const [rel, want] of Object.entries(frozen)) {
  check(`protected ${rel} freeze hash`, sha256(rel) === want, sha256(rel));
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
