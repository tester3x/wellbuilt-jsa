/**
 * Live wiring for the JSA SSO callback owner. Screens and _layout only.
 */
import {
  handleJsaSsoCallbackUrl,
  isJsaSsoCallbackUrl,
  type CallbackOwnerResult,
  type JsaCallbackOwnerDeps,
} from './jsaCallbackOwner';
import {
  consumeCallback,
  markConsumed,
  parseJsaSsoCallbackUrl,
} from './jsaPkce';
import {
  clearAttempt,
  loadAttempt,
  loadGovernedSession,
  loadLaunchContext,
  saveAttempt,
  saveGovernedSession,
} from './jsaRuntime';
import { sessionFromExchange, validateExchangePayload } from './jsaSession';
import { ownAndObtain } from './jsaGovernedLive';

export { isJsaSsoCallbackUrl, reconstructJsaCallbackUrl } from './jsaCallbackOwner';

function liveCallbackDeps(): JsaCallbackOwnerDeps {
  return {
    nowMs: () => Date.now(),
    parseUrl: (url) => parseJsaSsoCallbackUrl(url),
    loadAttempt: () => loadAttempt(),
    consume: (attempt, parsed, nowMs) =>
      consumeCallback(attempt as any, parsed as any, nowMs) as any,
    markConsumed: (attempt) => markConsumed(attempt as any) as any,
    saveAttempt: (attempt) => saveAttempt(attempt as any),
    clearAttempt: () => clearAttempt(),
    exchange: async ({ code, verifier }) => {
      const { getApp } = await import('firebase/app');
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const callable = httpsCallable(
        getFunctions(getApp()),
        'ssoExchangeAuthorizationCode',
        { timeout: 15000 },
      );
      const result = await callable({
        protocolVersion: 1,
        audience: 'wellbuilt-jsa',
        code,
        codeVerifier: verifier,
      });
      return validateExchangePayload(result.data);
    },
    saveSession: async (payload) => {
      await saveGovernedSession(sessionFromExchange(payload as any, null));
    },
    loadSession: () => loadGovernedSession(),
    obtainAfterSession: async () => {
      const launch = await loadLaunchContext();
      if (!launch) return;
      await ownAndObtain(launch);
    },
  };
}

export async function consumeJsaSsoCallback(url: unknown): Promise<CallbackOwnerResult> {
  return handleJsaSsoCallbackUrl(url, liveCallbackDeps());
}
