/**
 * Behavioral tests for the pure JSA registration payload and Back contracts.
 * Run: node tools/test-jsaRegistrationContract.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadPureTypescript(relativePath) {
  const filename = join(ROOT, relativePath);
  const javascript = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  const requireNone = (name) => {
    throw new Error('Pure registration contract unexpectedly required ' + name);
  };
  Function('exports', 'module', 'require', '__filename', '__dirname', javascript)(
    module.exports,
    module,
    requireNone,
    filename,
    dirname(filename),
  );
  return module.exports;
}

const registration = loadPureTypescript('services/jsaRegistrationContract.ts');
const back = loadPureTypescript('components/registrationBack.ts');
const polling = loadPureTypescript('services/registrationPollGuard.ts');
let passed = 0;
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) passed += 1;
  else failed += 1;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : ' — ' + detail));
}

const withoutLegalName = registration.buildJsaRegistrationPayload({
  displayName: '  MBurger  ',
  legalName: '   ',
  companyCode: ' abcd-2345 ',
  passcode: 'secret77',
});

check('hyphenated join code is accepted and uppercased',
  withoutLegalName.companyCode === 'ABCD-2345', withoutLegalName.companyCode);
check('display name is trimmed', withoutLegalName.displayName === 'MBurger');
check('blank optional legal name is omitted', !Object.hasOwn(withoutLegalName, 'legalName'));
check('free-text companyName is absent', !Object.hasOwn(withoutLegalName, 'companyName'));
check('source is exactly wbjsa', withoutLegalName.source === 'wbjsa');
check('passcode is carried unchanged', withoutLegalName.passcode === 'secret77');
check('payload has only the exact fields for blank legal name',
  JSON.stringify(Object.keys(withoutLegalName).sort())
    === JSON.stringify(['companyCode', 'displayName', 'passcode', 'source']));

const withLegalName = registration.buildJsaRegistrationPayload({
  displayName: 'MBurger',
  legalName: '  Michael Burger  ',
  companyCode: 'wxyz 9876',
  passcode: 'secret77',
});
check('nonblank legal name is trimmed and included', withLegalName.legalName === 'Michael Burger');
check('space-separated join code remains available to server normalization',
  withLegalName.companyCode === 'WXYZ 9876');
check('typed input uppercases without deleting separators',
  registration.uppercaseCompanyCodeInput('ab-12 cd') === 'AB-12 CD');
check('governed pending response returns its opaque id',
  registration.pendingRegistrationIdFromResponse({ pendingId: ' request-1 ', status: 'pending' }) === 'request-1');
check('response without explicit pending status is rejected',
  registration.pendingRegistrationIdFromResponse({ pendingId: 'request-1' }) === null);
check('non-pending response is rejected',
  registration.pendingRegistrationIdFromResponse({ pendingId: 'request-1', status: 'approved' }) === null);
check('blank pending id is rejected',
  registration.pendingRegistrationIdFromResponse({ pendingId: '   ', status: 'pending' }) === null);

check('register Back dismisses an open keyboard first',
  back.registrationBackAction('register', true) === 'dismiss_keyboard');
check('register Back returns to Sign In after keyboard closes',
  back.registrationBackAction('register', false) === 'return_to_sign_in');
check('pending Back returns to Sign In',
  back.registrationBackAction('pending', false) === 'return_to_sign_in');
check('other screens do not consume Back',
  back.registrationBackAction('other', false) === 'unhandled');

const guard = polling.createRegistrationPollGuard();
const oldGeneration = guard.begin();
let releaseStatus;
const delayedStatus = new Promise((resolve) => { releaseStatus = resolve; });
const lateTransition = (async () => {
  if (!guard.tryStart(oldGeneration)) return false;
  await delayedStatus;
  return guard.isCurrent(oldGeneration);
})();
guard.invalidate();
releaseStatus('approved');
check('Back invalidates an in-flight approval response', await lateTransition === false);

const currentGeneration = guard.begin();
check('only one status check can run at a time',
  guard.tryStart(currentGeneration) === true && guard.tryStart(currentGeneration) === false);
guard.finish(oldGeneration);
check('a stale completion cannot unlock a newer status check',
  guard.tryStart(currentGeneration) === false);
guard.finish(currentGeneration);
check('the current completion permits the next status check',
  guard.tryStart(currentGeneration) === true);

console.log('\nRESULT passed=' + passed + ' failed=' + failed + ' total=' + (passed + failed));
process.exit(failed ? 1 : 0);
