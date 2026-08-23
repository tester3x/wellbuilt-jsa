import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decideJobDetailsIsolation, iconReopenSurface, initialStartMayOwn, INITIAL_OWNER_RESUME_TTL_MS } from '../services/sso/jsaJobDetailsIsolation.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let pass = 0; let fail = 0;
function check(name, ok) { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } }
const base = { resolved: true, authoritySurface: 'unverified_gate', explicitGovernedFailure: false,
  hasUsableGovernedSession: false, hasMatchingAuthoritativeContext: false, authPending: false };

check('fresh install icon launch enters standalone login',
  !decideJobDetailsIsolation({ ...base, hasGovernedLaunch: false }).blocked);
check('clear app data icon launch enters standalone login',
  iconReopenSurface({ ...base, hasGovernedLaunch: false }) === 'standalone');
check('stale prior initial intent is refused after clear data',
  !initialStartMayOwn({ installationSeen: false, ignoredSameRequest: false, ownerSameRequest: false, ownerAgeMs: null }));
check('same ignored Android intent stays refused',
  !initialStartMayOwn({ installationSeen: true, ignoredSameRequest: true, ownerSameRequest: false, ownerAgeMs: null }));
check('stale owned initial intent expires to standalone',
  !initialStartMayOwn({ installationSeen: true, ignoredSameRequest: false, ownerSameRequest: true, ownerAgeMs: INITIAL_OWNER_RESUME_TTL_MS + 1 }));
check('no governed launch plus unavailable authority is standalone',
  !decideJobDetailsIsolation({ ...base, hasGovernedLaunch: false }).blocked);
check('valid governed launch plus unavailable authority fails closed',
  decideJobDetailsIsolation({ ...base, hasGovernedLaunch: true }).reason === 'unverified_gate');
check('legitimate recently owned governed launch remains bound',
  initialStartMayOwn({ installationSeen: true, ignoredSameRequest: false, ownerSameRequest: true, ownerAgeMs: 1000 }));

const gate = readFileSync(join(root, 'components/ShiftAuthorityGate.tsx'), 'utf8');
const layout = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
const runtime = readFileSync(join(root, 'services/sso/jsaRuntime.ts'), 'utf8');
check('gate offers standalone login', gate.includes('Open standalone login') && layout.includes('leaveGovernedForStandalone'));
check('gate offers local sign out', gate.includes('Sign out and clear local JSA session'));
check('authenticated gate offers reachable Settings', gate.includes('Open JSA settings')
  && layout.includes("router.push('/settings')") && layout.includes("pathname !== '/settings'"));
check('Return to WellBuilt only renders for a real governed launch', gate.includes('hasGovernedLaunch &&'));
check('standalone escape clears local governed/auth state without Suite writes',
  runtime.includes('clearLocalGovernedLaunchState')
  && runtime.includes('clearGovernedSession()')
  && !/fetch\(|httpsCallable|driver_shifts|shiftAuthority/.test(runtime.slice(runtime.indexOf('clearLocalGovernedLaunchState'))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
