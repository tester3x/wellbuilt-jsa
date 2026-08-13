/**
 * Request/return lifecycle. The client never invents a receipt — it
 * calls jsaCompleteReadRequest and returns only after success/reused.
 */
import {
  buildJsaReturnUrl,
  type JsaLaunchRequest,
  type JsaReturnStatus,
} from './jsaLaunch';
import {
  mayReturnAfterComplete,
  returnStatusForAction,
  type JsaCompleteResult,
} from './jsaRequestLifecycle';

export function decideReturn(input: {
  launch: JsaLaunchRequest | null;
  status: JsaReturnStatus;
  completion?: JsaCompleteResult | null;
}): { open: string } | { stay: true; reason: 'no_return' | 'no_launch' | 'not_completed' } {
  if (!input.launch) return { stay: true, reason: 'no_launch' };
  if (input.launch.returnTo !== 'wbt') return { stay: true, reason: 'no_return' };
  if (input.completion !== undefined && !mayReturnAfterComplete(input.completion)) {
    return { stay: true, reason: 'not_completed' };
  }
  return {
    open: buildJsaReturnUrl({
      v: 1,
      requestId: input.launch.requestId,
      status: input.status,
    }),
  };
}

export function decideGovernedReturn(input: {
  launch: JsaLaunchRequest | null;
  completion: JsaCompleteResult | null;
}): { open: string } | { stay: true; reason: 'no_return' | 'no_launch' | 'not_completed' } {
  if (!input.completion) return { stay: true, reason: 'not_completed' };
  return decideReturn({
    launch: input.launch,
    status: returnStatusForAction(input.completion.action),
    completion: input.completion,
  });
}

/** Server-authored complete is available. Client must not invent a receipt. */
export const GOVERNED_RECEIPT_WRITE_AVAILABLE = true;
export const GOVERNED_RECEIPT_CLIENT_INVENTED = false;
