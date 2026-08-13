/**
 * Request/return lifecycle. Receipt WRITE is not implemented here —
 * there is no governed Functions receipt path yet.
 */
import {
  buildJsaReturnUrl,
  type JsaLaunchRequest,
  type JsaReturnStatus,
} from './jsaLaunch.ts';

export function decideReturn(input: {
  launch: JsaLaunchRequest | null;
  status: JsaReturnStatus;
}): { open: string } | { stay: true; reason: 'no_return' | 'no_launch' } {
  if (!input.launch) return { stay: true, reason: 'no_launch' };
  if (input.launch.returnTo !== 'wbt') return { stay: true, reason: 'no_return' };
  return {
    open: buildJsaReturnUrl({
      v: 1,
      requestId: input.launch.requestId,
      status: input.status,
    }),
  };
}

/** Receipt write is a backend dependency. Client must not invent one. */
export const GOVERNED_RECEIPT_WRITE_AVAILABLE = false;
