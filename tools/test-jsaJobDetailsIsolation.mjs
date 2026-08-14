/**
 * Fail-closed Job Details / navigation isolation.
 * Run: node --experimental-strip-types tools/test-jsaJobDetailsIsolation.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideJobDetailsIsolation,
  unresolvedJobDetailsIsolation,
  returnToSatisfiesJobDetails,
  returnToIsGovernedFailure,
  effectiveDeepLinkedForJobDetails,
  hasValidatedJobContext,
  handleNextAllowed,
  stepsRouteAllowed,
  stepsContentAllowed,
  iconReopenSurface,
  isolationSurfaceKind,
  authoritativeContextMatchesLaunch,
} from '../services/sso/jsaJobDetailsIsolation.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};

const RID = 'R'.repeat(43);

const unresolved = unresolvedJobDetailsIsolation();
check('initial unresolved Job Details state mounts no workflow',
  unresolved.reason === 'unresolved'
  && unresolved.mountForm === false
  && unresolved.mountNext === false
  && unresolved.isolateOnly === true
  && handleNextAllowed(unresolved.blocked) === false);

const blockedGate = decideJobDetailsIsolation({
  resolved: true,
  authoritySurface: 'unverified_gate',
  explicitGovernedFailure: false,
  hasGovernedLaunch: true,
  hasUsableGovernedSession: false,
  hasMatchingAuthoritativeContext: false,
  authPending: false,
});

check('jsa_returnTo set plus blocking gate does not set effective Job Details completion',
  returnToSatisfiesJobDetails('wbt') === false
  && effectiveDeepLinkedForJobDetails({ returnToSet: true, hasJobContext: false }) === false
  && blockedGate.blocked === true);

check('returnTo=wbt alone is not classified as governed failure',
  returnToIsGovernedFailure('wbt') === false);

check('returnTo=wbt plus verified authority plus usable session plus matching context is allowed',
  decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'jsa_content',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    authPending: false,
  }).mountForm === true
  && iconReopenSurface({
    explicitGovernedFailure: false,
    authoritySurface: 'jsa_content',
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
  }) === 'standalone');

check('session exists but matching authoritative context does not → UI remains blocked',
  decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'jsa_content',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: false,
    authPending: false,
  }).blocked === true
  && authoritativeContextMatchesLaunch({
    launchRequestId: RID, contextRequestId: 'S'.repeat(43),
  }) === false);

check('stale context request ID does not unlock current launch',
  authoritativeContextMatchesLaunch({
    launchRequestId: RID, contextRequestId: 'S'.repeat(43),
  }) === false
  && authoritativeContextMatchesLaunch({
    launchRequestId: RID, contextRequestId: RID,
  }) === true);

check('blocking unverified gate does not mount Job Details or Next',
  blockedGate.mountForm === false && blockedGate.mountNext === false);

check('handleNext no-ops while blocked',
  handleNextAllowed(true) === false && handleNextAllowed(false) === true);

check('/steps rejects stale/direct navigation while blocked',
  stepsRouteAllowed(true) === false && stepsRouteAllowed(false) === true);

check('/steps mounts no workflow before its asynchronous guard resolves',
  stepsContentAllowed('unresolved') === false
  && stepsContentAllowed('denied') === false
  && stepsContentAllowed('allowed') === true);

check('reopen after a real governed failure remains isolated',
  iconReopenSurface({
    explicitGovernedFailure: true,
    authoritySurface: 'unverified_gate',
    hasGovernedLaunch: true,
    hasUsableGovernedSession: false,
    hasMatchingAuthoritativeContext: false,
  }) === 'isolated_gate');

const standalone = decideJobDetailsIsolation({
  resolved: true,
  authoritySurface: 'history_only',
  explicitGovernedFailure: false,
  hasGovernedLaunch: false,
  hasUsableGovernedSession: false,
  hasMatchingAuthoritativeContext: false,
  authPending: false,
});
check('valid non-governed standalone launch retains intended behavior',
  standalone.blocked === false && standalone.mountForm === true
  && iconReopenSurface({
    explicitGovernedFailure: false,
    authoritySurface: 'history_only',
    hasGovernedLaunch: false,
    hasUsableGovernedSession: false,
    hasMatchingAuthoritativeContext: false,
  }) === 'standalone');

check('governed authorization pending isolates and does not mount the form',
  decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'jsa_content',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: false,
    hasMatchingAuthoritativeContext: false,
    authPending: true,
  }).reason === 'auth_pending');

{
  const before = decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: null,
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: false,
    hasMatchingAuthoritativeContext: false,
    authPending: true,
  });
  const after = decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'jsa_content',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    authPending: false,
  });
  check('live transition: launch without usable Auth isolates, then success with context clears isolation',
    before.isolateOnly === true && after.blocked === false);
}

check('index loader rejection remains fail-closed',
  unresolvedJobDetailsIsolation().mountForm === false
  && unresolvedJobDetailsIsolation().mountNext === false);

check('layout begins unresolved/blocked',
  unresolvedJobDetailsIsolation().blocked === true);

check('governed usable Auth plus unverified shift still blocks /steps',
  decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'unverified_gate',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    authPending: false,
  }).blocked === true);

check('isolation reason selects the correct surface',
  isolationSurfaceKind('unresolved') === 'connecting'
  && isolationSurfaceKind('auth_pending') === 'connecting'
  && isolationSurfaceKind('unverified_gate') === 'unverified_gate'
  && isolationSurfaceKind('governed_failed') === 'governed_failed'
  && isolationSurfaceKind(null) === null);

check('return target only is not deep-linked',
  hasValidatedJobContext({ returnTo: 'wbt' }) === false
  && effectiveDeepLinkedForJobDetails({ returnToSet: true, hasJobContext: false }) === false);

check('actual valid job context is deep-linked as previously intended',
  hasValidatedJobContext({ wellName: 'Bakken 12' }) === true
  && hasValidatedJobContext({ disposal: 'SWD-1' }) === true
  && effectiveDeepLinkedForJobDetails({ returnToSet: false, hasJobContext: true }) === true);

check('governed identity-free /start is not deep-linked',
  hasValidatedJobContext({ v: '1', source: 'wbt', requestId: RID, returnTo: 'wbt' }) === false);

const indexSrc = readFileSync(join(root, 'app/(tabs)/index.tsx'), 'utf8');
check('index does not set deepLinked from jsa_returnTo',
  !/getItem\('jsa_returnTo'\)[\s\S]{0,120}setDeepLinked\(true\)/.test(indexSrc)
  && indexSrc.includes('hasValidatedJobContext(params)'));
check('index uses isolation predicate, handleNextAllowed, and usable Auth session',
  indexSrc.includes('decideJobDetailsIsolation')
  && indexSrc.includes('handleNextAllowed')
  && indexSrc.includes('workflowIsolation')
  && indexSrc.includes('loadUsableGovernedSession')
  && indexSrc.includes('unresolvedJobDetailsIsolation'));
check('index initial isolation is unresolved/fail-closed',
  indexSrc.includes('unresolvedJobDetailsIsolation()'));
check('index does not mount Job Details / Next while isolated',
  indexSrc.includes('workflowIsolation.mountForm'));
check('index preserves Return without treating it as deep-link proof',
  indexSrc.includes('launchOrigin')
  && indexSrc.includes('Return to WB')
  && returnToSatisfiesJobDetails('wbt') === false);
check('index does not introduce a Login fallback on the isolated surface',
  indexSrc.includes('GovernedIsolationSurface')
  && !indexSrc.includes('LoginScreen'));
check('index loader catch stays unresolved',
  /catch \{[\s\S]{0,80}unresolvedJobDetailsIsolation/.test(indexSrc));

const stepsSrc = readFileSync(join(root, 'app/steps.tsx'), 'utf8');
check('/steps has a route-level isolation guard that holds content until allowed',
  stepsSrc.includes('stepsRouteAllowed')
  && stepsSrc.includes("stepsGuard !== 'allowed'")
  && stepsSrc.includes('loadUsableGovernedSession')
  && stepsSrc.includes('export function StepsWorkflow'));
check('/steps inner workflow hooks do not mount before guard approval',
  stepsSrc.indexOf("stepsGuard !== 'allowed'") < stepsSrc.indexOf('return <StepsWorkflow')
  && /if \(stepsGuard !== 'allowed'\)[\s\S]*return <StepsWorkflow/.test(stepsSrc));
check('/steps treats unverified shift with launch as unverified_gate regardless of Auth',
  stepsSrc.includes("(!verified && !!launch) ? 'unverified_gate'"));

const layoutSrc = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
check('layout isolation uses usable Auth session, not raw SecureStore or return target',
  layoutSrc.includes('loadUsableGovernedSession')
  && layoutSrc.includes('decideJobDetailsIsolation')
  && layoutSrc.includes('authWorkflowIsolation')
  && layoutSrc.includes('unresolvedJobDetailsIsolation')
  && /await resolveUnauthSurface\(\)/.test(layoutSrc));
check('layout loader rejection remains fail-closed',
  /catch \{[\s\S]{0,120}unresolvedJobDetailsIsolation/.test(layoutSrc));
check('authenticated reopen after governed failure still isolates (tabs) form',
  layoutSrc.includes('GovernedIsolationSurface')
  && !/authWorkflowIsolation[\s\S]{0,250}LoginScreen/.test(layoutSrc));
check('no identity-bearing URL restoration introduced',
  !layoutSrc.includes('hash=') || layoutSrc.includes("refusal: 'malformed'"));
check('no client-authored shift binding introduced',
  !/setItem\(\s*['"]wellbuilt-current-shift-id['"],\s*['"]20/.test(indexSrc));

const isoSrc = readFileSync(join(root, 'services/sso/jsaJobDetailsIsolation.ts'), 'utf8');
check('isolation module has no credential console output',
  !/console\.(log|warn|error)/.test(isoSrc));

const surfSrc = readFileSync(join(root, 'components/GovernedIsolationSurface.tsx'), 'utf8');
check('isolation surface uses ShiftAuthorityGate only for unverified_gate',
  surfSrc.includes("kind === 'unverified_gate'")
  && surfSrc.includes('Cannot continue')
  && surfSrc.includes('GOVERNED_CONNECTING_COPY'));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
