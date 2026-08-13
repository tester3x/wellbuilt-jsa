/**
 * Durable ownership of a governed launch. The request is a HINT.
 * One owner per requestId; a later valid launch replaces it.
 */
import type { JsaLaunchRequest } from './jsaLaunch';

export interface JsaLaunchOwnership {
  request: JsaLaunchRequest;
  receivedAtMs: number;
}

export function takeLaunchOwnership(
  current: JsaLaunchOwnership | null,
  next: JsaLaunchRequest,
  nowMs: number,
): { action: 'own' | 'replace' | 'duplicate'; ownership: JsaLaunchOwnership } {
  if (!current) {
    return { action: 'own', ownership: { request: next, receivedAtMs: nowMs } };
  }
  if (current.request.requestId === next.requestId) {
    return { action: 'duplicate', ownership: current };
  }
  return { action: 'replace', ownership: { request: next, receivedAtMs: nowMs } };
}
