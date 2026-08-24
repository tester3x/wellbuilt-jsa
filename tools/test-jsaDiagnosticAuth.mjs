/**
 * JSA C4 diagnostic client authentication inventory.
 * Run: node tools/test-jsaDiagnosticAuth.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const diag = readFileSync(join(ROOT, 'services', 'wbDiagLog.ts'), 'utf8');
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

check('endpoint is writeDiagnosticLog', /writeDiagnosticLog/.test(diag));
check('uses governed JSA Auth', /getGovernedAuth/.test(diag) && /awaitGovernedAuthReady/.test(diag));
check('Authorization Bearer contract', /Authorization:\s*`Bearer \$\{token\}`/.test(diag));
check('missing token does not fetch', /if \(!authz\) return;/.test(diag) && /await fetch/.test(diag));
check('token refresh then fail closed', /getIdToken\(false\)/.test(diag) && /getIdToken\(true\)/.test(diag));
check('no unauthenticated fetch headers-only JSON', !/headers:\s*\{\s*'Content-Type': 'application\/json'\s*\}/.test(diag));
check('omits driverHash from body', /forbidden client identity/.test(diag) && !/driverHash: input\.driverHash/.test(diag));
check('no token logging', !/console\.(log|warn|error|debug)\([^)]*token/i.test(diag));
check('no SecureStore token persist', !/setItemAsync|SecureStore/.test(diag));
check('no RTDB fallback', !/drivers\/pending|firebasePost/.test(diag));
check('still fire-and-forget', /void submitDiagnostic/.test(diag));

// Pins refreshed for the source-audited governed identity correction above f5a8087fd4f37b3a7f8906ef73c94c377c56a634.
const frozen = {
  'services/sso/jsaGovernedAuthLive.ts': 'f95faaaadb74f061f170a531b15748c7ac5325e1c4339cf44d69aa400b6d208b',
  'services/sso/jsaGovernedAuth.ts': '63d442b780be412e37b13b2ae8bc8dcda413a4cc0688d694b25d02493160ef5f',
  'services/sso/jsaArtifactCallables.ts': '127f909e5d7b38a5b830152c2d66f0e1919dfa9adc132a92bef05e1cdbbb8a32',
  'services/sso/jsaRequestCallables.ts': '4dd637a900d74f653272402d8cbd7836d34ebf386bfc2cee1d158a9360fb542c',
  'services/sso/jsaRequestLifecycle.ts': '04978ae1fa34510c6a92a917e6c6d0fee71203fd0cf49795ae429df887042e02',
  'app/contexts/AuthContext.tsx': 'f0ab90851482f35ebc471c43d572b028dd03164489b17cb0d698f32c1ddf3054',
};
for (const [rel, want] of Object.entries(frozen)) {
  const got = sha256(rel);
  check(`hash-locked ${rel}`, got === want, got);
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
