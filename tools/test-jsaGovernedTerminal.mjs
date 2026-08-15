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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
