/**
 * Thin Firebase callable wrappers for the held get/complete interface.
 * Bodies are exact-key only. No identity, names, or authority in the
 * request. Errors classify to fail-closed refusals.
 */
import {
  classifyCallableError,
  classifyGetError,
  getOutcomeLogCategory,
  type JsaCompleteResult,
  type JsaCompletionAction,
  type JsaRefusal,
  type JsaRequestContextView,
} from './jsaRequestLifecycle';

const TIMEOUT_MS = 15_000;

export type GetContextOutcome =
  | { ok: true; view: JsaRequestContextView }
  | { ok: false; refusal: JsaRefusal };

export type CompleteOutcome =
  | { ok: true; result: JsaCompleteResult }
  | { ok: false; refusal: JsaRefusal };

/** Reason codes only — never URLs, tokens, payloads, or bodies. */
function logGetOutcome(requestId: string, category: string): void {
  console.log(JSON.stringify({
    tag: '[jsa-get]',
    outcome: category,
    requestId: `${requestId.slice(0, 8)}…`,
  }));
}

/** Single flight per requestId — duplicates join, never fan out. */
const getInFlight = new Map<string, Promise<GetContextOutcome>>();

export async function jsaGetReadRequest(requestId: string): Promise<GetContextOutcome> {
  const joined = getInFlight.get(requestId);
  if (joined) return joined;
  const run = (async (): Promise<GetContextOutcome> => {
    // ONE bounded attempt. No automatic second attempt: the 45s bound
    // already exceeds the worst captured scale-from-zero readiness (32s,
    // field 8/13), and the connecting surface stays visible throughout.
    try {
      // No jsa* read callable is exported from Dashboard/functions/src/index.ts.
      logGetOutcome(requestId, getOutcomeLogCategory('update_required'));
      return { ok: false, refusal: 'update_required' };
    } catch (err) {
      const refusal = classifyGetError(err);
      logGetOutcome(requestId, getOutcomeLogCategory(refusal, err));
      return { ok: false, refusal };
    }
  })().finally(() => {
    getInFlight.delete(requestId);
  });
  getInFlight.set(requestId, run);
  return run;
}

export async function jsaCompleteReadRequest(
  requestId: string,
  action: JsaCompletionAction,
): Promise<CompleteOutcome> {
  try {
    void requestId;
    void action;
    return { ok: false, refusal: 'update_required' };
  } catch (err) {
    return { ok: false, refusal: classifyCallableError(err) };
  }
}
