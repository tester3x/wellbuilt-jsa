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

// Pins refreshed against Codex-approved governed source bc961573e12f0de789827b529b38d606d4be7173.
const frozen = {
  'services/sso/jsaGovernedAuthLive.ts': '36613eaa3f62f8098902d828e7cfbdecdd75c4c8cab0ec64da47cf9740601d82',
  'services/sso/jsaGovernedAuth.ts': 'ad6ea49666d2137dd88cb3249fe8bd065d5786db376f982e00d7778b5c167ebf',
  'services/sso/jsaArtifactCallables.ts': '127f909e5d7b38a5b830152c2d66f0e1919dfa9adc132a92bef05e1cdbbb8a32',
  'services/sso/jsaRequestCallables.ts': '4dd637a900d74f653272402d8cbd7836d34ebf386bfc2cee1d158a9360fb542c',
  'services/sso/jsaRequestLifecycle.ts': 'd140338069b96c5e251573604ffec6bd20f06c844300522db4eedb6a7d7473b5',
  'app/contexts/AuthContext.tsx': '8a817c02b571410e83b5f751f23cb5930c94eaa75c9bb3af5c1615ec8e79c90b',
};
for (const [rel, want] of Object.entries(frozen)) {
  const got = sha256(rel);
  check(`hash-locked ${rel}`, got === want, got);
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
