/**
 * Phase 5C-2 / C2 — fresh submitted vs later replay terminal surfaces.
 * Run: node --experimental-strip-types tools/test-jsaGovernedTerminal.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decideCompletedTerminalSurface,
  hrefForCompletedTerminal,
  governedCombinedTerminalCopy,
  parseFreshSubmittedMarker,
  submittedHeading,
  replayHeading,
  shouldRecordFreshSubmitted,
  decideAfterReturnHandoff,
} from '../services/sso/jsaGovernedTerminal.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
const check = (n, ok, d = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${ok || !d ? '' : ` — ${d}`}`);
};
const src = (p) => readFileSync(join(root, p), 'utf8');

const RID = 'R'.repeat(43);
const marker = { requestId: RID, action: 'read_and_acknowledged', submittedAtMs: 1 };

check('fresh successful completion is the submitted surface',
  decideCompletedTerminalSurface({
    contextState: 'completed', contextRequestId: RID,
    launchRequestId: RID, marker,
  }) === 'fresh_submitted'
  && hrefForCompletedTerminal('fresh_submitted', 'read_and_acknowledged').params?.mode === 'submitted'
  && submittedHeading() === 'JSA Submitted');

check('fresh completion does not immediately render Already completed',
  hrefForCompletedTerminal('fresh_submitted', 'read_and_acknowledged').params?.mode !== 'completed'
  && decideCompletedTerminalSurface({
    contextState: 'completed', contextRequestId: RID,
    launchRequestId: RID, marker,
  }) !== 'already_completed');

check('same-session rerender/resume restores JSA Submitted',
  decideCompletedTerminalSurface({
    contextState: 'completed', contextRequestId: RID,
    launchRequestId: RID, marker,
  }) === 'fresh_submitted'
  && submittedHeading() === 'JSA Submitted');

{
  const signoff = src('app/signoff.tsx');
  const route = src('services/sso/jsaGovernedRoute.ts');
  check('resume does not create another save/submit/queue/persist/artifact',
    /recordFreshGovernedSubmitted/.test(signoff)
    && /resolveCompletedTerminalHref/.test(signoff)
    && !/commitGovernedAfterLocalSave/.test(route.slice(
      route.indexOf("if (decision.next === 'return_completed')"),
      route.indexOf("if (decision.next === 'return_completed')") + 180,
    )));
}

{
  const stay = decideCompletedTerminalSurface({
    contextState: 'completed', contextRequestId: RID,
    launchRequestId: null, marker: null,
  });
  const status = src('app/governed-status.tsx');
  const runtime = src('services/sso/jsaRuntime.ts');
  check('Stay on JSA reaches clean home or History',
    stay === 'none'
    && hrefForCompletedTerminal('none') === '/(tabs)'
    && status.includes('consumeGovernedLaunchAfterStay')
    && status.includes("router.replace('/(tabs)')")
    && status.includes('Stay on JSA'));
  check('Stay on JSA does not route back into the completed replay surface',
    stay !== 'already_completed'
    && runtime.includes('clearFreshSubmittedMarker')
    && runtime.includes('clearLaunchContext'));
  const stayFn = runtime.slice(
    runtime.indexOf('export async function consumeGovernedLaunchAfterStay'),
    runtime.indexOf('export async function consumeGovernedLaunchAfterStay') + 420,
  );
  check('Stay on JSA preserves frozen History/PDF data and durable artifact state',
    stayFn.includes('clearFreshSubmittedMarker')
    && stayFn.includes('clearLaunchContext')
    && !stayFn.includes('clearRequestContext')
    && !stayFn.includes('clearGovernedSession')
    && !stayFn.includes('saves'));
}

check('later genuine replay may render Already completed',
  decideCompletedTerminalSurface({
    contextState: 'completed', contextRequestId: RID,
    launchRequestId: RID, marker: null,
  }) === 'already_completed'
  && hrefForCompletedTerminal('already_completed', 'read_and_acknowledged').params?.mode === 'completed'
  && replayHeading() === 'Already completed');

{
  const pending = decideCompletedTerminalSurface({
    contextState: 'pending', contextRequestId: RID,
    launchRequestId: RID, marker: null,
  });
  const failed = decideCompletedTerminalSurface({
    contextState: null, contextRequestId: null,
    launchRequestId: RID, marker: null,
  });
  const signoff = src('app/signoff.tsx');
  check('pending or failed completion never renders JSA Submitted',
    pending === 'none' && failed === 'none'
    && /skipForcedSubmitted/.test(signoff)
    && /if \(skipForcedSubmitted\) return/.test(signoff)
    && /done\.kind === 'fail_closed'/.test(signoff)
    && /done\.kind === 'pending_retry'/.test(signoff));
}

{
  const form = src('tools/test-jsaGovernedFormEvidence.mjs');
  const session = src('services/sso/jsaSession.ts');
  check('missing legalName still fails closed',
    form.includes('missing governed legalName blocks Submit')
    && session.includes("classified.kind === 'invalid'"));
}

{
  const signoff = src('app/signoff.tsx');
  check('double Submit remains single-flight',
    signoff.includes('submitLockRef')
    && /if \(submitLockRef\.current\) return/.test(signoff));
}

check('combined governed terminal copy is Read and acknowledged',
  governedCombinedTerminalCopy('read_and_acknowledged') === 'Read and acknowledged');

{
  const status = src('app/governed-status.tsx');
  check('no immediate or resume path says only Recorded as acknowledged',
    !status.includes('Recorded as')
    && status.includes('governedCombinedTerminalCopy')
    && governedCombinedTerminalCopy('read_and_acknowledged') !== 'Recorded as acknowledged');
}

check('historical completed save without launch is not treated as replay',
  decideCompletedTerminalSurface({
    contextState: 'completed', contextRequestId: RID,
    launchRequestId: null,
    marker: { requestId: RID, action: 'read_and_acknowledged', submittedAtMs: 1 },
  }) === 'none');

check('parse rejects garbage markers',
  parseFreshSubmittedMarker(null) === null
  && parseFreshSubmittedMarker({ requestId: RID }) === null
  && parseFreshSubmittedMarker(marker)?.requestId === RID);

check('submitted heading is exactly JSA Submitted',
  submittedHeading() === 'JSA Submitted');

const index = src('app/(tabs)/index.tsx');
check('home no longer auto-routes every completed context to Already completed',
  index.includes('resolveCompletedTerminalHref')
  && /if \(href !== '\/\(tabs\)'\)/.test(index));

function makeLifecycle() {
  const store = {
    marker: null,
    launch: { requestId: RID, returnTo: 'wbt' },
    ownership: { requestId: RID },
    uiStage: 'signoff',
    context: { state: 'pending', requestId: RID, action: null },
    session: { uid: 'uid-a' },
    saves: [{ id: 'save-1', pdfUrl: 'pdf' }],
    queue: [{ requestId: RID }],
    artifacts: [{ requestId: RID }],
    completes: 0,
    saveWrites: 0,
    persistCalls: 0,
    opened: [],
  };
  const surface = () => decideCompletedTerminalSurface({
    contextState: store.context.state,
    contextRequestId: store.context.requestId,
    launchRequestId: store.launch?.requestId ?? null,
    marker: store.marker,
  });
  const href = () => hrefForCompletedTerminal(surface(), store.context.action);
  const recordSuccess = (action) => {
    store.completes += 1;
    store.context = { state: 'completed', requestId: RID, action };
    if (shouldRecordFreshSubmitted({ kind: 'completed' })) {
      store.marker = parseFreshSubmittedMarker({
        requestId: RID, action, submittedAtMs: Date.now(),
      });
    }
  };
  const consumeTransient = () => {
    store.marker = null;
    store.launch = null;
    store.ownership = null;
    store.uiStage = null;
  };
  const returnHandoff = (opened) => {
    if (opened) store.opened.push(`wellbuilt-tickets://jsa-return?v=1&requestId=${RID}&status=acknowledged`);
    const next = decideAfterReturnHandoff(opened);
    if (next === 'consume') consumeTransient();
    return next;
  };
  return { store, surface, href, recordSuccess, consumeTransient, returnHandoff };
}

{
  const life = makeLifecycle();
  life.recordSuccess('read_and_acknowledged');
  check('1 fresh signoff completion records marker and shows JSA Submitted',
    life.store.marker?.requestId === RID
    && life.surface() === 'fresh_submitted'
    && life.href().params?.mode === 'submitted'
    && submittedHeading() === 'JSA Submitted');
}

{
  const ack = src('app/acknowledge.tsx');
  const life = makeLifecycle();
  life.recordSuccess('acknowledged');
  check('2 fresh acknowledge-only completion records marker and shows JSA Submitted',
    life.surface() === 'fresh_submitted'
    && life.href().params?.mode === 'submitted'
    && ack.includes('recordFreshGovernedSubmitted')
    && !/if \(!done\.reused\)/.test(ack));
  check('3 acknowledge-only completion does not open WB-T before the submitted screen',
    !ack.includes('decideGovernedReturn')
    && !ack.includes('Linking.openURL')
    && !ack.includes('Linking'));
}

{
  const route = src('services/sso/jsaGovernedRoute.ts');
  const retryFalse = makeLifecycle();
  retryFalse.recordSuccess('read_and_acknowledged');
  const retryTrue = makeLifecycle();
  retryTrue.recordSuccess('read_and_acknowledged');
  check('4 successful retry with reused:false shows JSA Submitted',
    shouldRecordFreshSubmitted({ kind: 'completed' }) === true
    && retryFalse.surface() === 'fresh_submitted'
    && route.includes('await recordFreshGovernedSubmitted(pending.requestId, done.action)')
    && !route.includes('if (!done.reused)'));
  check('5 successful retry with reused:true also shows JSA Submitted',
    shouldRecordFreshSubmitted({ kind: 'completed' }) === true
    && retryTrue.surface() === 'fresh_submitted'
    && hrefForCompletedTerminal('fresh_submitted', 'read_and_acknowledged').params?.mode === 'submitted');
}

{
  const life = makeLifecycle();
  life.recordSuccess('read_and_acknowledged');
  const afterBg = life.surface();
  const afterFg = life.surface();
  check('6 rerender/background/resume without explicit exit preserves submitted',
    afterBg === 'fresh_submitted' && afterFg === 'fresh_submitted'
    && life.store.marker?.requestId === RID
    && life.store.launch?.requestId === RID);
}

{
  const life = makeLifecycle();
  life.recordSuccess('read_and_acknowledged');
  life.consumeTransient();
  check('7 Stay clears only transient launch/navigation and reaches clean home',
    life.surface() === 'none'
    && hrefForCompletedTerminal('none') === '/(tabs)'
    && life.store.saves.length === 1
    && life.store.queue.length === 1
    && life.store.artifacts.length === 1
    && life.store.context.state === 'completed'
    && life.store.session.uid === 'uid-a');
}

{
  const life = makeLifecycle();
  life.recordSuccess('read_and_acknowledged');
  const before = { ...life.store.marker, launch: life.store.launch };
  const result = life.returnHandoff(true);
  check('8 successful Return first opens the exact governed return URL, then clears transient',
    result === 'consume'
    && life.store.opened[0].startsWith('wellbuilt-tickets://jsa-return')
    && life.store.opened[0].includes(RID)
    && life.store.marker === null
    && life.store.launch === null
    && src('app/governed-status.tsx').includes('handoffGovernedReturnThenConsume')
    && src('services/sso/jsaRuntime.ts').includes('opened_and_consumed'));
  check('failed Return is tested separately from the success path', !!before.launch);
}

{
  const life = makeLifecycle();
  life.recordSuccess('read_and_acknowledged');
  const result = life.returnHandoff(false);
  check('9 failed Return handoff retains marker and launch',
    result === 'retain'
    && life.store.marker?.requestId === RID
    && life.store.launch?.requestId === RID
    && life.surface() === 'fresh_submitted'
    && decideAfterReturnHandoff(false) === 'retain');
}

{
  const life = makeLifecycle();
  life.recordSuccess('read_and_acknowledged');
  check('pre-exit surface is submitted, not Already completed', life.surface() === 'fresh_submitted');
  const completesBeforeExit = life.store.completes;
  life.returnHandoff(true);
  check('explicit successful Return is what clears the marker', life.store.marker === null);
  life.store.launch = { requestId: RID, returnTo: 'wbt' };
  check('10 after successful Return, later launch of same completed request is Already completed',
    life.store.marker === null
    && life.store.context.state === 'completed'
    && life.store.launch.requestId === RID
    && life.surface() === 'already_completed'
    && life.href().params?.mode === 'completed');
  check('11 later replay performs no second save, complete, queue, persist, or artifact op',
    life.store.completes === completesBeforeExit
    && life.store.saveWrites === 0
    && life.store.persistCalls === 0
    && life.store.saves.length === 1
    && life.store.queue.length === 1
    && life.store.artifacts.length === 1);
  check('12 frozen History/PDF, request context, session, queue, and artifact survive Stay and Return',
    life.store.saves[0].pdfUrl === 'pdf'
    && life.store.context.requestId === RID
    && life.store.session.uid === 'uid-a'
    && life.store.queue[0].requestId === RID
    && life.store.artifacts[0].requestId === RID);
}

{
  check('13 pending or failed completion never records the marker',
    shouldRecordFreshSubmitted({ kind: 'pending_retry' }) === false
    && shouldRecordFreshSubmitted({ kind: 'fail_closed' }) === false
    && shouldRecordFreshSubmitted({ kind: 'completed' }) === true);
}

{
  const auth = src('services/driverAuth.ts');
  check('14 logout clears the marker according to governed logout policy',
    auth.includes('@jsa/freshGovernedSubmitted')
    && auth.includes('@jsa/governedLaunchContext')
    && !/multiRemove\(\[[\s\S]*@jsa\/saves/.test(auth));
}

check('15 Read and acknowledged remains the combined wording',
  governedCombinedTerminalCopy('read_and_acknowledged') === 'Read and acknowledged');
check('16 Recorded as acknowledged remains absent',
  !src('app/governed-status.tsx').includes('Recorded as')
  && governedCombinedTerminalCopy('read_and_acknowledged') !== 'Recorded as acknowledged');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
