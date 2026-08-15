/**
 * Live I/O wiring for governed get/complete. Screens only.
 */
import {
  obtainAuthoritativeContext,
  ownGovernedLaunch,
  recoverGovernedRequest,
  completeAfterLocalSave,
  type GovernedEntryDeps,
} from './jsaGovernedEntry';
import type { UnauthRecoveryOutcome } from './jsaGovernedAuth';
import {
  clearPendingComplete,
  loadLaunchContext,
  loadLaunchOwnership,
  loadPendingComplete,
  loadRequestContext,
  saveLaunchContext,
  saveLaunchOwnership,
  savePendingComplete,
  saveRequestContext,
} from './jsaRuntime';
import { jsaCompleteReadRequest, jsaGetReadRequest } from './jsaRequestCallables';
import type { JsaLaunchRequest } from './jsaLaunch';
import {
  awaitGovernedAuthReady,
  liveBeginUnauthenticatedRecovery,
  liveConsumeRecoveryLatch,
  loadUsableGovernedSession,
} from './jsaGovernedAuthLive';
import { clearGovernedTerminalFailureFor, markGovernedTerminalFailure } from './jsaRuntime';

const liveBeginMatchesEntryDeps: NonNullable<GovernedEntryDeps['beginUnauthenticatedRecovery']> =
  liveBeginUnauthenticatedRecovery;
void liveBeginMatchesEntryDeps;
const _joinPresent: Extract<UnauthRecoveryOutcome, 'join'> = 'join';
void _joinPresent;

export function liveGovernedDeps(): GovernedEntryDeps {
  return {
    nowMs: () => Date.now(),
    loadOwnership: () => loadLaunchOwnership() as Promise<any>,
    saveOwnership: (own) => saveLaunchOwnership(own as any),
    saveLaunch: (req) => saveLaunchContext(req as any),
    loadLaunch: () => loadLaunchContext(),
    loadSession: () => loadUsableGovernedSession(),
    awaitAuthReady: () => awaitGovernedAuthReady(),
    beginUnauthenticatedRecovery: (session) => liveBeginUnauthenticatedRecovery(session),
    consumeRecoveryLatch: (session) => liveConsumeRecoveryLatch(session),
    markTerminalFailure: (requestId) => markGovernedTerminalFailure(requestId),
    clearTerminalFailure: (requestId) => clearGovernedTerminalFailureFor(requestId).then(() => undefined),
    get: (requestId) => jsaGetReadRequest(requestId),
    complete: (requestId, action) => jsaCompleteReadRequest(requestId, action),
    saveContext: (view) => saveRequestContext(view),
    loadContext: () => loadRequestContext(),
    savePending: (rec) => savePendingComplete(rec),
    loadPending: () => loadPendingComplete(),
    clearPending: () => clearPendingComplete(),
  };
}

export async function ownAndObtain(launch: JsaLaunchRequest) {
  const deps = liveGovernedDeps();
  await ownGovernedLaunch(deps, launch);
  return obtainAuthoritativeContext(deps);
}

export async function recoverGoverned() {
  const decision = await recoverGovernedRequest(liveGovernedDeps());
  void import('./jsaArtifactLive').then((m) => { void m.settleGovernedArtifactQueue(); });
  return decision;
}

export async function completeGovernedAfterLocalSave(input: {
  requestId: string;
  action: import('./jsaRequestLifecycle').JsaCompletionAction;
  localRecordId: string;
}) {
  return completeAfterLocalSave(liveGovernedDeps(), {
    ...input,
    nowMs: Date.now(),
  });
}
