/**
 * Live I/O wiring for the governed /start owner. Screens and _layout only.
 */
import {
  handleJsaStartUrl,
  isJsaStartUrl,
  markProcessOpenedStart,
  processHasOpenedStart,
  reconstructJsaStartUrl,
  type StartOwnerResult,
  type JsaStartOwnerDeps,
} from './jsaStartOwner';
import { isLegacyJsaLaunchUrl, parseJsaLaunchUrl } from './jsaLaunch';
import { takeOwnedLaunch } from './jsaRequestLifecycle';
import { liveGovernedDeps, ownAndObtain } from './jsaGovernedLive';
import { obtainAuthoritativeContext } from './jsaGovernedEntry';
import {
  loadAttempt,
  loadGovernedSession,
  loadLaunchOwnership,
  mintAttempt,
  saveLaunchContext,
  saveLaunchOwnership,
} from './jsaRuntime';
import { buildAuthorizeUrl } from './jsaPkce';
import { resolveEntryRoute } from './jsaGovernedRoute';

export {
  isJsaStartUrl,
  reconstructJsaStartUrl,
  normalizeJsaStartUrl,
} from './jsaStartOwner';

function logStart(event: string): void {
  console.log(JSON.stringify({ tag: '[jsa-start]', event }));
}

function liveStartDeps(): JsaStartOwnerDeps {
  return {
    nowMs: () => Date.now(),
    isLegacy: (url) => isLegacyJsaLaunchUrl(url),
    parseLaunch: (url) => {
      const parsed = parseJsaLaunchUrl(url);
      if (!parsed.ok) return { ok: false };
      return { ok: true, value: parsed.value };
    },
    ownLaunch: async (launch) => {
      const deps = liveGovernedDeps();
      const current = await loadLaunchOwnership();
      const taken = takeOwnedLaunch(current as any, launch as any, deps.nowMs());
      await saveLaunchOwnership(taken.ownership as any);
      await saveLaunchContext(taken.ownership.request as any);
      return taken.action;
    },
    loadSession: () => loadGovernedSession(),
    loadAttempt: () => loadAttempt(),
    mintAttempt: async () => {
      const Crypto = await import('expo-crypto');
      return mintAttempt({
        randomBytes: (n) => Crypto.getRandomBytesAsync(n),
        sha256Hex: async (s) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
        nowMs: () => Date.now(),
      });
    },
    openSuite: async (attempt) => {
      const Linking = await import('expo-linking');
      await Linking.openURL(buildAuthorizeUrl(attempt as any));
    },
    obtain: () => obtainAuthoritativeContext(liveGovernedDeps()),
    log: (event) => logStart(event),
    hasOpenedFor: (id) => processHasOpenedStart(id),
    markOpened: (id) => markProcessOpenedStart(id),
  };
}

export async function consumeJsaStart(url: unknown): Promise<StartOwnerResult> {
  return handleJsaStartUrl(url, liveStartDeps());
}

/** Resume a stored launch after a false /sso-callback landing. */
export async function consumeStoredGovernedStart(): Promise<StartOwnerResult> {
  const { loadLaunchContext } = await import('./jsaRuntime');
  const { buildJsaLaunchUrl } = await import('./jsaLaunch');
  const launch = await loadLaunchContext();
  if (!launch) return { kind: 'ignored' };
  return consumeJsaStart(buildJsaLaunchUrl(launch));
}

export async function hrefAfterStart(
  result: StartOwnerResult,
): Promise<any | null> {
  if (result.kind === 'fail_closed') {
    return {
      pathname: '/governed-status',
      params: { mode: 'fail', refusal: result.refusal || 'malformed' },
    };
  }
  if (result.kind === 'ready') {
    return resolveEntryRoute(result.decision as any, liveGovernedDeps());
  }
  return null;
}

/** Own after a callback session lands — same pending request. */
export async function resumeStartAfterSession(): Promise<void> {
  const launch = await (await import('./jsaRuntime')).loadLaunchContext();
  if (!launch) return;
  await ownAndObtain(launch);
}
