/**
 * Map an entry/recovery decision onto an Expo route. No identity in params.
 */
import type { EntryDecision } from './jsaGovernedEntry';
import { completeAfterLocalSave } from './jsaGovernedEntry';
import type { GovernedEntryDeps } from './jsaGovernedEntry';
import { saveGovernedUiStage } from './jsaRuntime';

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
    return {
      pathname: '/governed-status',
      params: { mode: 'completed', action: decision.action },
    };
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
      void import('./jsaArtifactLive').then((m) => { void m.settleGovernedArtifactQueue(); });
      return {
        pathname: '/governed-status',
        params: {
          mode: 'completed',
          action: done.action,
          reused: done.reused ? '1' : '0',
        },
      };
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
