/**
 * Map an entry/recovery decision onto an Expo route. No identity in params.
 */
import type { EntryDecision } from './jsaGovernedEntry';
import { completeAfterLocalSave } from './jsaGovernedEntry';
import type { GovernedEntryDeps } from './jsaGovernedEntry';
import {
  loadFreshSubmittedMarker,
  loadLaunchContext,
  loadRequestContext,
  recordFreshGovernedSubmitted,
  saveGovernedUiStage,
} from './jsaRuntime';
import {
  decideCompletedTerminalSurface,
  hrefForCompletedTerminal,
} from './jsaGovernedTerminal';

export async function resolveCompletedTerminalHref(reused?: boolean): Promise<any> {
  const ctx = await loadRequestContext();
  const launch = await loadLaunchContext();
  const marker = await loadFreshSubmittedMarker();
  const surface = decideCompletedTerminalSurface({
    contextState: ctx?.state ?? null,
    contextRequestId: ctx?.requestId ?? null,
    launchRequestId: launch?.requestId ?? null,
    marker,
  });
  return hrefForCompletedTerminal(surface, ctx?.action, reused);
}

export async function resolveEntryRoute(
  decision: EntryDecision,
  deps: GovernedEntryDeps,
): Promise<any> {
  if (decision.kind === 'need_auth') return '/(tabs)';
  if (decision.kind === 'fail_closed') {
    return {
      pathname: '/governed-status',
      params: { mode: 'fail', refusal: decision.refusal },
    };
  }
  if (decision.next === 'return_completed') {
    return resolveCompletedTerminalHref();
  }
  if (decision.next === 'retry_complete') {
    const pending = await deps.loadPending();
    if (!pending) {
      return { pathname: '/governed-status', params: { mode: 'fail', refusal: 'complete_failed' } };
    }
    const done = await completeAfterLocalSave(deps, {
      requestId: pending.requestId,
      action: pending.action,
      localRecordId: pending.localRecordId,
      nowMs: deps.nowMs(),
    });
    if (done.kind === 'completed') {
      void import('./jsaArtifactLive').then((m) => m.settleGovernedArtifactQueue()).catch(() => {
        console.log(JSON.stringify({ tag: '[jsa-artifact-queue]', outcome: 'settle_failed' }));
      });
      await recordFreshGovernedSubmitted(pending.requestId, done.action);
      return resolveCompletedTerminalHref();
    }
    return { pathname: '/governed-status', params: { mode: 'fail', refusal: done.refusal } };
  }
  if (decision.next === 'resume_ui') {
    await saveGovernedUiStage(decision.ui);
    if (decision.ui === 'acknowledge_only') return '/acknowledge';
    return '/(tabs)';
  }
  return '/(tabs)';
}
