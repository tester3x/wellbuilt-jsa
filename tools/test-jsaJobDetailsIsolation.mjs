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
  authorizedGovernedRequestReady,
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

check('matching successful get is not isolated by client unverified_gate',
  authorizedGovernedRequestReady({
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    explicitGovernedFailure: false,
  }) === true
  && decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'unverified_gate',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    authPending: false,
  }).blocked === false
  && decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'unverified_gate',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    authPending: false,
  }).surface === null);

check('unverified_gate still isolates when the get has not authorized this launch',
  decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'unverified_gate',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: false,
    authPending: false,
  }).blocked === true
  && decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: 'unverified_gate',
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: false,
    authPending: false,
  }).reason === 'unverified_gate');

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
  /catch (?:\([^)]*\) )?\{[\s\S]{0,160}unresolvedJobDetailsIsolation/.test(indexSrc));

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
  /catch \{[\s\S]{0,400}unresolvedJobDetailsIsolation/.test(layoutSrc));
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

// ── Launch-resolution root isolation (vc10) ─────────────────────────────────
{
  const {
    launchResolutionBlocksContent,
    GOVERNED_RESOLVING_COPY,
    decideJobDetailsIsolation,
  } = await import('../services/sso/jsaJobDetailsIsolation.ts');

  // Receiving a valid governed start immediately blocks historical local
  // content; zero candidates → standalone/icon behavior unchanged.
  check('an accepted start candidate blocks historical content',
    launchResolutionBlocksContent(1) === true);
  check('two racing candidates still block', launchResolutionBlocksContent(2) === true);
  check('no candidate → standalone presentation unchanged',
    launchResolutionBlocksContent(0) === false);
  check('resolving copy is bounded and non-identity',
    typeof GOVERNED_RESOLVING_COPY === 'string'
    && !/name|hash|request|token/i.test(GOVERNED_RESOLVING_COPY));

  // The old completed acknowledgment can never paint as the new request:
  // a governed launch without MATCHING authoritative context stays on the
  // connecting surface — matching context alone unlocks the workflow.
  const inFlight = decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: null,
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: false,
    authPending: false,
  });
  check('launch without matching context: blocked on connecting',
    inFlight.blocked && inFlight.surface === 'connecting'
    && !inFlight.mountForm && !inFlight.storedFieldsActionable);
  const matched = decideJobDetailsIsolation({
    resolved: true,
    authoritySurface: null,
    explicitGovernedFailure: false,
    hasGovernedLaunch: true,
    hasUsableGovernedSession: true,
    hasMatchingAuthoritativeContext: true,
    authPending: false,
  });
  check('matching authoritative context alone unlocks',
    !matched.blocked && matched.mountForm);

  // Root wiring pins: _layout gates the overlay on the pure decision and
  // brackets every accepted candidate with the resolving counter.
  const layoutSrc = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
  check('_layout renders the resolving overlay from the pure decision',
    layoutSrc.includes('launchResolutionBlocksContent(startResolving)')
    && layoutSrc.includes('GOVERNED_RESOLVING_COPY'));
  // The counter is published at the owner choke point every route/Linking/
  // getInitialURL/stored entry uses — the overlay covers ALL entries, not
  // just _layout's own handlers.
  const startLiveSrc = readFileSync(join(root, 'services/sso/jsaStartLive.ts'), 'utf8');
  check('_layout subscribes to the owner-published resolving count',
    layoutSrc.includes('subscribeStartResolving'));
  check('every accepted candidate raises the count at the choke point',
    startLiveSrc.includes('bumpStartResolving(1)')
    && startLiveSrc.includes('bumpStartResolving(-1)')
    && /const accepted = typeof url === 'string' && isJsaStartUrl\(url\);/.test(startLiveSrc));
  check('stale/superseded results never steer UI',
    layoutSrc.includes("if (result.kind === 'ignored') return;"));

  // Losing routes never navigate — only the winner steers. Old completed
  // content cannot appear between loser settlement and winner navigation:
  // losers hold their neutral connecting surface and the owner-published
  // overlay covers the window while any candidate resolves.
  const startSrc2 = readFileSync(join(root, 'app/start.tsx'), 'utf8');
  const cbSrc2 = readFileSync(join(root, 'app/sso-callback.tsx'), 'utf8');
  check('start.tsx loser branch does not navigate',
    startSrc2.includes("if (result.kind === 'ignored' && result.refusal) return;")
    && !startSrc2.includes("router.replace('/(tabs)'"));
  check('sso-callback loser branches do not navigate',
    (cbSrc2.match(/kind === 'ignored' && startResult\.refusal\) return;/g) || []).length === 2
    && !cbSrc2.includes("router.replace('/(tabs)'"));
}

// ── R4 FIELD-SHAPED STOP CONDITION (Codex Finding 2) ────────────────────────
// Reproduces the release blocker: an existing session + bootstrap holding
// stale initial request A, live request B arriving, and the bootstrap
// effect re-delivering A as `initial` when isAuthenticated flips
// false→true. Both meaningful orderings. B must win exactly once; A must
// never fetch, persist, navigate, or surface stale content afterward.
{
  const {
    handleJsaStartUrl,
    resetJsaStartOwnerForTests,
    getStartOwnershipForTests,
  } = await import('../services/sso/jsaStartOwner.ts');
  const { buildJsaLaunchUrl } = await import('../services/sso/jsaLaunch.ts');
  const { JSA_GET_TIMEOUT_MS } = await import('../services/sso/jsaRequestLifecycle.ts');

  const RID_A = 'A'.repeat(43);
  const RID_B2 = 'B'.repeat(43);
  const mkUrl = (id) => buildJsaLaunchUrl({
    v: 1, source: 'wbt', requestId: id, returnTo: 'wbt', jobRef: 'jobDoc1',
  });
  const mkGate = () => { let release; const p = new Promise((r) => { release = r; }); return { p, release }; };
  function fieldDeps(state) {
    return {
      nowMs: () => 10_000,
      isLegacy: () => false,
      parseLaunch: (u) => {
        const mm = /requestId=([A-Za-z0-9_-]{43})/.exec(u);
        return mm ? { ok: true, value: { requestId: mm[1], returnTo: 'wbt' } } : { ok: false };
      },
      ownLaunch: async () => 'own',
      currentOwnedRequestId: async () => state.persistedOwner,
      isKnownStale: async () => false,
      loadSession: async () => ({ uid: 'u' }), // existing governed session
      loadAttempt: async () => null,
      mintAttempt: async () => ({ consumed: false, createdAtMs: 10_000 }),
      openSuite: async () => { state.suiteOpens += 1; },
      obtain: async (stillOwned, commitEffect) => {
        state.gets.push({ ownedAtStart: stillOwned() });
        const g = state.getGates.shift();
        if (g) await g;
        // A durable context write is modeled through the owner commit —
        // exactly how the lifecycle persists (commitOwnedEffect).
        const committed = await commitEffect(async () => { state.contextWrites.push(stillOwned()); });
        return committed.applied ? { kind: 'ready' } : { kind: 'fail_closed', refusal: 'not_found' };
      },
      log: () => {},
      hasOpenedFor: () => false,
      markOpened: () => {},
    };
  }

  // ORDERING 1: bootstrap initial-A begins first (get in flight), live B
  // arrives, then bootstrap re-enters (isAuthenticated false→true) and
  // re-delivers A as initial.
  {
    resetJsaStartOwnerForTests();
    const g = mkGate();
    const state = { persistedOwner: RID_A, suiteOpens: 0, gets: [], contextWrites: [], getGates: [g.p] };
    const deps = fieldDeps(state);
    const pA = handleJsaStartUrl(mkUrl(RID_A), deps, 'initial'); // bootstrap holds A
    while (state.gets.length === 0) await Promise.resolve();
    const rB = await handleJsaStartUrl(mkUrl(RID_B2), deps, 'live'); // live B wins
    g.release();
    const rA = await pA;
    const replay = await handleJsaStartUrl(mkUrl(RID_A), deps, 'initial'); // re-entry
    check('field order 1: final owner is B, B exactly one get',
      rB.kind === 'ready' && getStartOwnershipForTests().requestId === RID_B2
      && state.gets.filter((x) => x.ownedAtStart).length === 2 // A began owned, B owned
      && state.gets.length === 2);
    check('field order 1: A settles superseded; late A wrote no context',
      rA.kind === 'ignored' && rA.refusal === 'superseded'
      && state.contextWrites.length === 1); // only B's commit applied
    check('field order 1: bootstrap re-delivery of A is refused, no new get',
      replay.kind === 'ignored' && replay.refusal === 'stale_replay'
      && state.gets.length === 2);
  }

  // ORDERING 2: live B first, then the bootstrap continuation delivers
  // stale initial A (repeatedly — effect re-entry).
  {
    resetJsaStartOwnerForTests();
    const state = { persistedOwner: RID_A, suiteOpens: 0, gets: [], contextWrites: [], getGates: [] };
    const deps = fieldDeps(state);
    const rB = await handleJsaStartUrl(mkUrl(RID_B2), deps, 'live');
    const rA1 = await handleJsaStartUrl(mkUrl(RID_A), deps, 'initial');
    const rA2 = await handleJsaStartUrl(mkUrl(RID_A), deps, 'initial');
    check('field order 2: B owns; every bootstrap A delivery refused, zero A gets',
      rB.kind === 'ready' && getStartOwnershipForTests().requestId === RID_B2
      && rA1.kind === 'ignored' && rA1.refusal === 'stale_replay'
      && rA2.kind === 'ignored' && rA2.refusal === 'stale_replay'
      && state.gets.length === 1 && state.contextWrites.length === 1);
  }

  // Navigation and surface assertions (source-pinned — RN modules cannot
  // load in node): the ignored bootstrap result returns IMMEDIATELY in
  // _layout with no route; stale content stays blocked while resolving.
  const layoutSrc2 = readFileSync(join(root, 'app/_layout.tsx'), 'utf8');
  const bootstrapSlice = layoutSrc2.slice(
    layoutSrc2.indexOf("decision.action === 'handle_launch'"),
    layoutSrc2.indexOf("decision.action === 'open_suite_authorize'"),
  );
  check('bootstrap getInitialURL delivery is explicitly initial',
    bootstrapSlice.includes("consumeJsaStart(url, 'initial')"));
  check('ignored bootstrap result returns immediately — no navigation',
    bootstrapSlice.includes("if (result.kind === 'ignored') return;")
    && bootstrapSlice.indexOf("if (result.kind === 'ignored') return;")
      < bootstrapSlice.indexOf('hrefAfterStart(result'));
  check('no governed-status navigation in the ignored bootstrap path',
    !/ignored'\) [\s\S]{0,80}governed-status/.test(bootstrapSlice));
  const startSrc3 = readFileSync(join(root, 'app/start.tsx'), 'utf8');
  const cbSrc3 = readFileSync(join(root, 'app/sso-callback.tsx'), 'utf8');
  check('no consumeJsaStart call anywhere omits provenance',
    !/consumeJsaStart\(([^,()]+|[^,()]*\([^)]*\)[^,()]*)\)/.test(
      layoutSrc2 + startSrc3 + cbSrc3));
  const { launchResolutionBlocksContent: blocksContent } =
    await import('../services/sso/jsaJobDetailsIsolation.ts');
  check('stale "Already completed" surface stays blocked while resolving',
    blocksContent(1) === true && blocksContent(2) === true);
  check('45s protected-get bound unchanged, no retry reintroduced',
    JSA_GET_TIMEOUT_MS === 45_000
    && !/retry/i.test(readFileSync(join(root, 'services/sso/jsaRequestCallables.ts'), 'utf8')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
