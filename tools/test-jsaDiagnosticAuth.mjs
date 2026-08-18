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

function sha256(rel) {
  return createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');
}

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

const frozen = {
  'services/sso/jsaGovernedAuthLive.ts': '09db9e27225f17f440b60b5fc96ec34a8d8749b16887199eb894fc35f58364fd',
  'services/sso/jsaGovernedAuth.ts': 'ad6ea49666d2137dd88cb3249fe8bd065d5786db376f982e00d7778b5c167ebf',
  'services/sso/jsaArtifactCallables.ts': '934f4c13bd8fa95235bf9dbead6c880f6b7b7f92632c8cef9f4d188df9082149',
  'services/sso/jsaRequestCallables.ts': '6f47d68dd7a2964b69fea514f573da1f6beffa927c2b34727e2ceb559c6859b3',
  'services/sso/jsaRequestLifecycle.ts': '15a4781f7dc72c3198774547ce13e4a6c9ffb59944d485bbc092955b936bcb0b',
  'app/contexts/AuthContext.tsx': '67f4497a0679ad6bcaacce565e2464d386b1c88d7af92aea236139fd5bf0c0ff',
};
for (const [rel, want] of Object.entries(frozen)) {
  const got = sha256(rel);
  check(`hash-locked ${rel}`, got === want, got);
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
