import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyManualLoginError,
  createManualAttemptTokenizer,
  createManualLoginCoordinator,
  executeManualLoginAttempt,
  JSA_MANUAL_LOGIN_AUDIENCE,
  manualInspectionMatches,
  parseManualLoginPayload,
} from '../services/sso/jsaManualLogin.ts';
import {
  installGovernedAuthSession,
  validatePersistedGovernedSession,
} from '../services/sso/jsaGovernedAuth.ts';
import { classifyGovernedStartup } from '../services/sso/jsaIdentityStartupContract.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manualCore = readFileSync(join(ROOT, 'services/sso/jsaManualLogin.ts'), 'utf8');
const live = readFileSync(join(ROOT, 'services/sso/jsaManualLoginLive.ts'), 'utf8');
const authContext = readFileSync(join(ROOT, 'app/contexts/AuthContext.tsx'), 'utf8');
const driverAuth = readFileSync(join(ROOT, 'services/driverAuth.ts'), 'utf8');
const callback = readFileSync(join(ROOT, 'services/sso/jsaCallbackLive.ts'), 'utf8');
let pass = 0; let fail = 0;
function check(name, ok) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); ok ? pass++ : fail++; }

const binding = { shiftState: 'none', requiresActiveShift: false, jsaEnabled: true };
const payload = {
  protocolVersion: 1,
  customToken: 'memory-only-token',
  uid: 'uid-a', driverId: 'driver-a', companyId: 'company-a',
  displayName: 'Driver A', legalName: 'Driver Alpha', jsaBinding: binding,
};

// Known governed identity: callable payload → Firebase Auth → sanitized session.
{
  let firebaseUid = null; let persisted = null;
  const result = await installGovernedAuthSession({
    payload, legalName: payload.legalName, generation: 'G-A',
    signInWithCustomToken: async (token) => { firebaseUid = token ? payload.uid : null; return { uid: firebaseUid }; },
    persist: async (session) => { persisted = session; },
  });
  check('known governed identity installs matching Firebase Auth', result.ok && firebaseUid === payload.uid);
  check('known governed identity persists one sanitized exact-bound session', result.ok
    && persisted?.driverId === payload.driverId && persisted?.companyId === payload.companyId
    && persisted?.binding.shiftState === 'none' && validatePersistedGovernedSession(persisted) !== null
    && !JSON.stringify(persisted).includes('memory-only-token'));
}

const bad = classifyManualLoginError({ code: 'functions/permission-denied', message: 'Invalid name or passcode' });
const unknown = classifyManualLoginError({ code: 'functions/permission-denied', message: 'Invalid name or passcode' });
check('bad passcode and unknown name receive the same bounded denial', !bad.ok && !unknown.ok
  && bad.code === 'invalid_credentials' && bad.message === unknown.message);
check('deactivated account has bounded actionable error',
  classifyManualLoginError({ code: 'functions/permission-denied', message: 'This account has been deactivated' }).code === 'deactivated');
check('missing secure conversion has bounded actionable error',
  classifyManualLoginError({ code: 'functions/failed-precondition', message: 'missing secure conversion' }).code === 'missing_secure_conversion');
check('offline and timeout share bounded retry error',
  classifyManualLoginError({ code: 'functions/unavailable' }).code === 'offline_timeout'
  && classifyManualLoginError({ code: 'functions/deadline-exceeded' }).code === 'offline_timeout');
check('server failure is distinct and bounded', classifyManualLoginError({ code: 'functions/internal' }).code === 'server_failure');

{
  let installs = 0; let inspections = 0; let cleanups = 0; let firebaseUid = null; let localSession = null;
  const result = await executeManualLoginAttempt({ displayName: 'A', passcode: 'secret', stillCurrent: () => true }, {
    call: async () => { throw { code: 'functions/unavailable' }; },
    install: async () => { installs++; firebaseUid = 'unexpected'; localSession = {}; },
    inspect: async () => { inspections++; return true; },
    cleanup: async () => { cleanups++; firebaseUid = null; localSession = null; },
  });
  check('network failure creates no local or Firebase authenticated session', !result.ok
    && result.code === 'offline_timeout' && installs === 0 && inspections === 0 && cleanups === 1
    && firebaseUid === null && localSession === null);
}

check('manual payload requires UID, driver, company, and strict JSA binding',
  parseManualLoginPayload(payload).ok
  && !parseManualLoginPayload({ ...payload, uid: '' }).ok
  && !parseManualLoginPayload({ ...payload, driverId: '' }).ok
  && !parseManualLoginPayload({ ...payload, companyId: '' }).ok
  && !parseManualLoginPayload({ ...payload, jsaBinding: null }).ok);
const usableInspection = {
  state: 'usable', binding: { uid: payload.uid, driverId: payload.driverId, companyId: payload.companyId },
  sessionBinding: binding,
};
check('UID driver company and binding mismatches all prevent readiness',
  manualInspectionMatches(payload, usableInspection)
  && !manualInspectionMatches(payload, { ...usableInspection, binding: { ...usableInspection.binding, uid: 'other' } })
  && !manualInspectionMatches(payload, { ...usableInspection, binding: { ...usableInspection.binding, driverId: 'other' } })
  && !manualInspectionMatches(payload, { ...usableInspection, binding: { ...usableInspection.binding, companyId: 'other' } })
  && !manualInspectionMatches(payload, { ...usableInspection, sessionBinding: { ...binding, jsaEnabled: false } }));

// Mismatch install never persists readiness/session and reconciles Firebase.
{
  let persisted = 0; let reconciled = 0;
  const result = await installGovernedAuthSession({
    payload, legalName: payload.legalName, generation: 'G-MISMATCH',
    signInWithCustomToken: async () => ({ uid: 'uid-other' }),
    persist: async () => { persisted++; }, reconcileAuth: async () => { reconciled++; },
  });
  check('UID mismatch creates no session and reconciles Firebase', !result.ok && result.reason === 'uid_mismatch'
    && persisted === 0 && reconciled === 1);
}

// Same-tick identical submission: token equality plus coordinator single flight.
{
  let randomCalls = 0; let callableCalls = 0;
  const tokenize = createManualAttemptTokenizer({
    randomBytes: async () => { randomCalls++; return new Uint8Array(32).fill(7); },
    sha256: async (s) => `digest:${s}`,
  });
  const [tokenA, tokenB] = await Promise.all([tokenize('Driver A', 'secret'), tokenize('Driver A', 'secret')]);
  const coordinator = createManualLoginCoordinator();
  let release; const held = new Promise((resolve) => { release = resolve; });
  const first = coordinator.run(tokenA, async () => { callableCalls++; await held; return 'ok'; });
  const second = coordinator.run(tokenB, async () => { callableCalls++; return 'duplicate'; });
  release();
  const values = await Promise.all([first, second]);
  check('same-tick double Sign In is one keyed single flight', randomCalls === 1 && callableCalls === 1
    && values[0] === 'ok' && values[1] === 'ok');
}

// A starts, B supersedes, A cannot install/publish before serialized B.
{
  const coordinator = createManualLoginCoordinator();
  let releaseA; const heldA = new Promise((resolve) => { releaseA = resolve; });
  const events = [];
  const a = coordinator.run('A', async (current) => {
    await heldA; if (current()) events.push('A-installed'); else events.push('A-stale'); return current();
  });
  await Promise.resolve();
  const b = coordinator.run('B', async (current) => { if (current()) events.push('B-installed'); return current(); });
  releaseA();
  const [aResult, bResult] = await Promise.all([a, b]);
  check('stale Driver A completion cannot replace Driver B', !aResult && bResult
    && events.join(',') === 'A-stale,B-installed');
}

check('restart restores only exact usable governed session',
  classifyGovernedStartup({ rawSessionPresent: true, session: { uid: 'u', driverId: 'd', companyId: 'c' },
    firebaseUid: 'u', tokenDriverId: 'd', tokenCompanyId: 'c', baselineBound: true }) === 'usable'
  && classifyGovernedStartup({ rawSessionPresent: true, session: { uid: 'u', driverId: 'd', companyId: 'c' },
    firebaseUid: 'u', tokenDriverId: 'other', tokenCompanyId: 'c', baselineBound: true }) === 'authority_mismatch');

check('manual login uses authenticateDriver with exact JSA audience', live.includes("'authenticateDriver'")
  && manualCore.includes('JSA_MANUAL_LOGIN_AUDIENCE') && JSA_MANUAL_LOGIN_AUDIENCE === 'wellbuilt-jsa');
check('passcode is sent only in governed callable body and never persisted or logged',
  /deps\.call\(\{[\s\S]{0,180}passcode/.test(manualCore)
  && !/SecureStore|AsyncStorage|console\./.test(live)
  && !/(setItem|saveDriverSession|console\.(log|warn|error))\([^)]*passcode/i.test(authContext));
check('direct RTDB credential read and API-key auth credential are absent',
  !driverAuth.includes('verifyLogin') && !/drivers\/approved\/\$\{hash\}/.test(driverAuth.slice(0, driverAuth.indexOf('// --- Session Management ---')))
  && !driverAuth.includes('?auth=') && !authContext.includes('?auth='));
check('AuthContext manual login never saves a legacy driver session',
  !authContext.slice(authContext.indexOf('const login ='), authContext.indexOf('const register =')).includes('saveDriverSession'));
check('network failure path creates no local legacy session',
  !live.includes('saveDriverSession') && live.includes('clearFailedInstallation'));
check('strict post-install inspection binds UID driver and company before success',
  live.includes('manualInspectionMatches') && live.includes('sessionBinding: installed?.binding'));
check('governed Suite SSO exchange remains wired', callback.includes("audience: 'wellbuilt-jsa'")
  && callback.includes('persistAfterExchange') && callback.includes('ssoExchangeAuthorizationCode'));
check('registration behavior remains callable-governed and pending-only',
  driverAuth.includes("'requestDriverRegistration'") && authContext.includes('registerStandaloneService')
  && authContext.includes('Pending-only. Never mint a local approved session'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
