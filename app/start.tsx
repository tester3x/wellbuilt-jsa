/**
 * Governed launch landing. Launch metadata is untrusted.
 * All /start deliveries share jsaStartOwner — this screen is not
 * required to mount. No identity in logs.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { colors } from '../constants/colors';
import { markGovernedReturnRequired } from '../services/shiftAuthorityStore';
import {
  consumeJsaStart,
  hrefAfterStart,
  normalizeJsaStartUrl,
  reconstructJsaStartUrl,
} from '../services/sso/jsaStartLive';

export default function StartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  useEffect(() => {
    (async () => {
      try {
        const fromParams = reconstructJsaStartUrl(params as Record<string, unknown>);
        const initialUrl = await Linking.getInitialURL();
        const url = fromParams || initialUrl;
        // Route params are a live navigation; the initial-URL fallback is a
        // replayable read. Android may remount the stale initial route with
        // reconstructed params on an icon reopen, so equal URLs remain initial.
        const sameInitial = !!fromParams && !!initialUrl
          && normalizeJsaStartUrl(fromParams) === normalizeJsaStartUrl(initialUrl);
        const provenance = fromParams && !sameInitial ? 'live' : 'initial';
        const result = await consumeJsaStart(url, provenance);
        if (result.kind === 'ignored' && result.refusal === 'stale_replay') {
          router.replace('/login');
          return;
        }
        // Stale replay / superseded run: this route's candidate lost.
        // A LOSER NEVER NAVIGATES — only the winning launch coordinator
        // chooses the destination. This screen stays on its neutral
        // connecting surface until the winner's navigation replaces it.
        if (result.kind === 'ignored' && result.refusal) return;
        if (result.kind === 'fail_closed') {
          await markGovernedReturnRequired('wbt');
        }
        const href = await hrefAfterStart(result);
        if (href) router.replace(href as any);
      } catch {
        await markGovernedReturnRequired('wbt');
        router.replace({
          pathname: '/governed-status',
          params: { mode: 'fail', refusal: 'network' },
        } as any);
      }
    })();
  }, [router, params]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
