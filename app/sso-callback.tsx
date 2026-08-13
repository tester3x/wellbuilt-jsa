/**
 * Expo Router landing for jsaapp://sso-callback?...
 *
 * On SINGLE_TASK reuse Expo Router delivers the callback as this route
 * and may not emit Linking 'url'. This screen reconstructs the URL and
 * forwards once to the shared owner (same as Linking / getInitialURL).
 * Query values are never logged.
 */
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
        const url = reconstructJsaCallbackUrl(params as Record<string, unknown>);
        const result = await consumeJsaSsoCallback(url);
        if (result.kind === 'fail_closed' || result.kind === 'ignored') {
          await markGovernedReturnRequired('suite');
          router.replace({
            pathname: '/governed-status',
            params: { mode: 'fail', refusal: result.refusal || 'unauthenticated' },
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
          params: { mode: 'fail', refusal: 'unauthenticated' },
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
