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

const frozen = {
  'services/sso/jsaArtifactCallables.ts': '934f4c13bd8fa95235bf9dbead6c880f6b7b7f92632c8cef9f4d188df9082149',
  'services/sso/jsaArtifactSnapshot.ts': '020c7f435d6ba27d53434c349d2ce1ddb3ebe21c69aa8239edee2d3712efb156',
  'services/sso/jsaRequestCallables.ts': '6f47d68dd7a2964b69fea514f573da1f6beffa927c2b34727e2ceb559c6859b3',
  'services/sso/jsaRequestLifecycle.ts': '15a4781f7dc72c3198774547ce13e4a6c9ffb59944d485bbc092955b936bcb0b',
  'tools/test-jsaRequestLifecycle.mjs': '7f3560710bd692f4c934df7b34e351133197f28501baa93a546ad86e3d79a12d',
};
for (const [rel, want] of Object.entries(frozen)) {
  check(`protected ${rel} freeze hash`, sha256(rel) === want, sha256(rel));
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
