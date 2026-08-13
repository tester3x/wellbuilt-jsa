/**
 * Thin Firebase callable wrappers for the held get/complete interface.
 * Bodies are exact-key only. No identity, names, or authority in the
 * request. Errors classify to fail-closed refusals.
 */
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  classifyCallableError,
  classifyGetError,
  parseCompleteResult,
  parseGetContextView,
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

export async function jsaGetReadRequest(requestId: string): Promise<GetContextOutcome> {
  try {
    const callable = httpsCallable(
      getFunctions(getApp()),
      'jsaGetReadRequest',
      { timeout: TIMEOUT_MS },
    );
    const result = await callable({ requestId });
    const parsed = parseGetContextView(result.data);
    if (!parsed.ok) return { ok: false, refusal: 'malformed' };
    return { ok: true, view: parsed.value };
  } catch (err) {
    return { ok: false, refusal: classifyGetError(err) };
  }
}

export async function jsaCompleteReadRequest(
  requestId: string,
  action: JsaCompletionAction,
): Promise<CompleteOutcome> {
  try {
    const callable = httpsCallable(
      getFunctions(getApp()),
      'jsaCompleteReadRequest',
      { timeout: TIMEOUT_MS },
    );
    const result = await callable({ requestId, action });
    const parsed = parseCompleteResult(result.data);
    if (!parsed.ok) return { ok: false, refusal: 'malformed' };
    return { ok: true, result: parsed.value };
  } catch (err) {
    return { ok: false, refusal: classifyCallableError(err) };
  }
}
