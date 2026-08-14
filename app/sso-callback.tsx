/**
 * Expo Router landing for jsaapp://sso-callback?...
 *
 * On SINGLE_TASK reuse Expo Router delivers the callback as this route
 * and may not emit Linking 'url'. This screen reconstructs the URL and
 * forwards once to the shared owner (same as Linking / getInitialURL).
 * An empty or absent callback is NOT an unauthenticated callback.
 * Query values are never logged.
 */
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { colors } from '../constants/colors';
import { markGovernedReturnRequired } from '../services/shiftAuthorityStore';

export default function JsaSsoCallbackRoute() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      try {
        const { reconstructJsaCallbackUrl, consumeJsaSsoCallback } =
          await import('../services/sso/jsaCallbackLive');
        const { recoverGoverned, liveGovernedDeps } =
          await import('../services/sso/jsaGovernedLive');
        const { resolveEntryRoute } = await import('../services/sso/jsaGovernedRoute');
        const {
          isJsaStartUrl,
          consumeJsaStart,
          consumeStoredGovernedStart,
          hrefAfterStart,
        } = await import('../services/sso/jsaStartLive');
        const url = reconstructJsaCallbackUrl(params as Record<string, unknown>);
        if (!url) {
          const incoming = await Linking.getInitialURL();
          const startResult = isJsaStartUrl(incoming)
            ? await consumeJsaStart(incoming, 'initial')
            : await consumeStoredGovernedStart();
          // Stale replay / superseded — a LOSER NEVER NAVIGATES; the
          // winning run steers. This screen holds its neutral connecting
          // surface until the winner's navigation replaces it.
          if (startResult.kind === 'ignored' && startResult.refusal) return;
          if (startResult.kind === 'ignored') {
            await markGovernedReturnRequired('wbt');
            router.replace({
              pathname: '/governed-status',
              params: { mode: 'fail', refusal: 'malformed' },
            } as any);
            return;
          }
          if (startResult.kind === 'fail_closed') {
            await markGovernedReturnRequired('wbt');
          }
          const href = await hrefAfterStart(startResult);
          if (href) router.replace(href as any);
          return;
        }
        const result = await consumeJsaSsoCallback(url);
        if (result.kind === 'ignored') {
          const startResult = await consumeStoredGovernedStart();
          // Loser never navigates — the winning run steers.
          if (startResult.kind === 'ignored' && startResult.refusal) return;
          if (startResult.kind === 'ignored') {
            await markGovernedReturnRequired('wbt');
            router.replace({
              pathname: '/governed-status',
              params: { mode: 'fail', refusal: 'malformed' },
            } as any);
            return;
          }
          const href = await hrefAfterStart(startResult);
          if (href) router.replace(href as any);
          return;
        }
        if (result.kind === 'fail_closed') {
          await markGovernedReturnRequired('suite');
          router.replace({
            pathname: '/governed-status',
            params: { mode: 'fail', refusal: result.refusal || 'malformed' },
          } as any);
          return;
        }
        const decision = await recoverGoverned();
        const href = await resolveEntryRoute(decision, liveGovernedDeps());
        router.replace(href as any);
      } catch {
        await markGovernedReturnRequired('suite');
        router.replace({
          pathname: '/governed-status',
          params: { mode: 'fail', refusal: 'network' },
        } as any);
      }
    })();
  }, [params, router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
