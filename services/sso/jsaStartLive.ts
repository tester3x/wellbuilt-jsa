/**
 * Live I/O wiring for the governed /start owner. Screens and _layout only.
 */
import {
  handleJsaStartUrl,
  isJsaStartUrl,
  markProcessOpenedStart,
  processHasOpenedStart,
  reconstructJsaStartUrl,
  type StartDeliveryProvenance,
  type StartOwnerResult,
  type JsaStartOwnerDeps,
} from './jsaStartOwner';
import { isLegacyJsaLaunchUrl, parseJsaLaunchUrl } from './jsaLaunch';
import { takeOwnedLaunch } from './jsaRequestLifecycle';
import { liveGovernedDeps, ownAndObtain } from './jsaGovernedLive';
import { obtainAuthoritativeContext } from './jsaGovernedEntry';
import {
  loadAttempt,
  loadAuthRecoveryLatch,
  loadLaunchOwnership,
  markGovernedTerminalFailure,
  mintAttempt,
  saveLaunchContext,
  saveLaunchOwnership,
} from './jsaRuntime';
import { buildAuthorizeUrl } from './jsaPkce';
import { resolveEntryRoute } from './jsaGovernedRoute';
import {
  awaitGovernedAuthReady,
  loadUsableGovernedSession,
} from './jsaGovernedAuthLive';

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
    currentOwnedRequestId: async () => {
      const own = await loadLaunchOwnership();
      return (own as any)?.request?.requestId ?? null;
    },
    isKnownStale: async (requestId) => {
      const { loadRequestContext, loadGovernedTerminalFailure } = await import('./jsaRuntime');
      const context = await loadRequestContext();
      if (context?.requestId === requestId && context.state === 'completed') return true;
      const terminal = await loadGovernedTerminalFailure();
      return terminal?.requestId === requestId;
    },
    loadSession: () => loadUsableGovernedSession(),
    awaitAuthReady: () => awaitGovernedAuthReady(),
    loadRecoveryLatch: () => loadAuthRecoveryLatch(),
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
    obtain: (stillOwned, commitEffect) => obtainAuthoritativeContext({
      ...liveGovernedDeps(),
      stillOwned,
      commitOwnedEffect: commitEffect,
    }),
    markTerminal: (requestId) => markGovernedTerminalFailure(requestId),
    log: (event) => logStart(event),
    hasOpenedFor: (id) => processHasOpenedStart(id),
    markOpened: (id) => markProcessOpenedStart(id),
  };
}

/**
 * Launch-resolution signal for the root connecting overlay. Counted here —
 * at the single choke point every route/Linking/getInitialURL entry uses —
 * so the overlay is effective for ALL entries, not just _layout's handlers.
 */
let startResolvingCount = 0;
const startResolvingListeners = new Set<(count: number) => void>();

export function subscribeStartResolving(listener: (count: number) => void): () => void {
  startResolvingListeners.add(listener);
  listener(startResolvingCount);
  return () => { startResolvingListeners.delete(listener); };
}

function bumpStartResolving(delta: number): void {
  startResolvingCount = Math.max(0, startResolvingCount + delta);
  startResolvingListeners.forEach((listener) => listener(startResolvingCount));
}

export async function consumeJsaStart(
  url: unknown,
  // REQUIRED — no fail-open default (see handleJsaStartUrl). TypeScript
  // fails any call site that omits its delivery provenance.
  provenance: StartDeliveryProvenance,
): Promise<StartOwnerResult> {
  const accepted = typeof url === 'string' && isJsaStartUrl(url);
  if (accepted) bumpStartResolving(1);
  try {
    // Terminal marking happens INSIDE the owner/lifecycle generation
    // boundary (commitIfOwned) — never here, where a superseded run's
    // late fail_closed could overwrite the successor's stored marker.
    return await handleJsaStartUrl(url, liveStartDeps(), provenance);
  } finally {
    if (accepted) bumpStartResolving(-1);
  }
}

/** Resume a stored launch after a false /sso-callback landing. */
export async function consumeStoredGovernedStart(): Promise<StartOwnerResult> {
  const { loadLaunchContext } = await import('./jsaRuntime');
  const { buildJsaLaunchUrl } = await import('./jsaLaunch');
  const launch = await loadLaunchContext();
  if (!launch) return { kind: 'ignored' };
  return consumeJsaStart(buildJsaLaunchUrl(launch), 'stored');
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
