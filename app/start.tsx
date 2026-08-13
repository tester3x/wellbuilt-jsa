/**
 * Governed launch landing. Launch metadata is untrusted.
 * Legacy hash/name/shiftId URLs are refused. No identity in logs.
 * After ownership, the session (or Suite PKCE) then jsaGetReadRequest
 * selects the UI. Launch hints never do.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { colors } from '../constants/colors';
import { parseJsaLaunchUrl, isLegacyJsaLaunchUrl } from '../services/sso/jsaLaunch';
import { markGovernedReturnRequired } from '../services/shiftAuthorityStore';
import { buildAuthorizeUrl } from '../services/sso/jsaPkce';
import { mintAttempt } from '../services/sso/jsaRuntime';
import { ownAndObtain } from '../services/sso/jsaGovernedLive';
import { liveGovernedDeps } from '../services/sso/jsaGovernedLive';
import { resolveEntryRoute } from '../services/sso/jsaGovernedRoute';

export default function StartScreen() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url && isLegacyJsaLaunchUrl(url)) {
          await markGovernedReturnRequired('wbt');
          router.replace({
            pathname: '/governed-status',
            params: { mode: 'fail', refusal: 'malformed' },
          } as any);
          return;
        }
        const parsed = parseJsaLaunchUrl(url);
        if (!parsed.ok) {
          await markGovernedReturnRequired('wbt');
          router.replace({
            pathname: '/governed-status',
            params: { mode: 'fail', refusal: 'malformed' },
          } as any);
          return;
        }
        const decision = await ownAndObtain(parsed.value);
        if (decision.kind === 'need_auth') {
          const Crypto = await import('expo-crypto');
          const attempt = await mintAttempt({
            randomBytes: (n) => Crypto.getRandomBytesAsync(n),
            sha256Hex: async (s) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s),
            nowMs: () => Date.now(),
          });
          await Linking.openURL(buildAuthorizeUrl(attempt));
          router.replace('/(tabs)');
          return;
        }
        const href = await resolveEntryRoute(decision, liveGovernedDeps());
        router.replace(href as any);
      } catch {
        await markGovernedReturnRequired('wbt');
        router.replace({
          pathname: '/governed-status',
          params: { mode: 'fail', refusal: 'network' },
        } as any);
      }
    })();
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
