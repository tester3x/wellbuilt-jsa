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
import { callbackMayOpenApp } from './jsaCallbackDestination';
import { inspectGovernedIdentityStartupDetailed } from './jsaIdentityStartupLive';
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
      const started = Date.now();
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
      console.info(`[JSA-Handoff] stage=exchange ms=${Date.now()-started}`);
      return validateExchangePayload(result.data);
    },
    saveSession: async (payload) => {
      const started = Date.now();
      await persistAfterExchange(payload as any);
      console.info(`[JSA-Handoff] stage=install_session ms=${Date.now()-started}`);
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
  const started = Date.now();
  console.log(JSON.stringify({ tag: '[jsa-callback]', event: 'invoked' }));
  const result = await handleJsaSsoCallbackUrl(url, liveCallbackDeps());
  console.info(`[JSA-Handoff] stage=callback ms=${Date.now()-started} result=${result.kind}`);
  if (result.kind === 'exchanged') {
    console.log(JSON.stringify({ tag: '[jsa-callback]', event: 'session_persisted' }));
  }
  return result;
}

export async function hrefAfterJsaCallback(result: CallbackOwnerResult): Promise<any> {
  const launch = await loadLaunchContext();
  if (result.purpose === 'app_access' && !launch) {
    const inspected = await inspectGovernedIdentityStartupDetailed();
      if (callbackMayOpenApp(result,false,inspected.state === 'usable')) {
        const {lastJsaScreen}=await import('../jsaScreenResume');
        return (await lastJsaScreen()) || '/(tabs)';
      }
  }
  const { recoverGoverned, liveGovernedDeps } = await import('./jsaGovernedLive');
  const { resolveEntryRoute } = await import('./jsaGovernedRoute');
  return resolveEntryRoute(await recoverGoverned(),liveGovernedDeps());
}
