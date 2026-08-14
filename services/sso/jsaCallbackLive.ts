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
  loadLaunchContext,
  saveAttempt,
} from './jsaRuntime';
import { validateExchangePayload } from './jsaSession';
import { ownAndObtain } from './jsaGovernedLive';
import {
  loadUsableGovernedSession,
  persistAfterExchange,
} from './jsaGovernedAuthLive';

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
      await persistAfterExchange(payload as any);
    },
    loadSession: () => loadUsableGovernedSession(),
    obtainAfterSession: async () => {
      const launch = await loadLaunchContext();
      if (!launch) return;
      await ownAndObtain(launch);
    },
  };
}

export async function consumeJsaSsoCallback(url: unknown): Promise<CallbackOwnerResult> {
  console.log(JSON.stringify({ tag: '[jsa-callback]', event: 'invoked' }));
  const result = await handleJsaSsoCallbackUrl(url, liveCallbackDeps());
  if (result.kind === 'exchanged') {
    console.log(JSON.stringify({ tag: '[jsa-callback]', event: 'session_persisted' }));
  }
  return result;
}
