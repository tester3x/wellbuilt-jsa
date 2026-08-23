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

// Pins refreshed against Codex-approved governed source bc961573e12f0de789827b529b38d606d4be7173.
const frozen = {
  'services/sso/jsaGovernedAuthLive.ts': 'ccbcf05ac422bc4c91813cbf281daf5069bf09d3efa261efe7bf1691e39f79d1',
  'services/sso/jsaGovernedAuth.ts': '94923a42ebb4e1bc99d8a5a89a0ac25b30f5f9c3eb890669e7e164e67e40d318',
  'services/sso/jsaArtifactCallables.ts': '94ba3b59b156576778b26decd8449a655776a6ba759768ad4b63f89cf7673624',
  'services/sso/jsaRequestCallables.ts': 'fa0b593b7a4bde78d121686eb269739270e9e0dfdb09ededccd6e1d33e3508ab',
  'services/sso/jsaRequestLifecycle.ts': '15a4781f7dc72c3198774547ce13e4a6c9ffb59944d485bbc092955b936bcb0b',
  'app/contexts/AuthContext.tsx': 'c352b1da02b58b8496b6da2f1a4a9aed4b608614c0bc6abb2bded1ffdcea32cf',
};
for (const [rel, want] of Object.entries(frozen)) {
  const got = sha256(rel);
  check(`hash-locked ${rel}`, got === want, got);
}

console.log(`\nRESULT passed=${pass} failed=${fail} total=${pass + fail}`);
process.exit(fail ? 1 : 0);
