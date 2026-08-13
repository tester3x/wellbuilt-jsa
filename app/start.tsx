/**
 * Governed launch landing. Launch metadata is untrusted.
 * Legacy hash/name/shiftId URLs are refused. No identity in logs.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { colors } from '../constants/colors';
import { parseJsaLaunchUrl, isLegacyJsaLaunchUrl } from '../services/sso/jsaLaunch';
import { saveLaunchContext } from '../services/sso/jsaRuntime';
import { markGovernedReturnRequired } from '../services/shiftAuthorityStore';

export default function StartScreen() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url && isLegacyJsaLaunchUrl(url)) {
          await markGovernedReturnRequired('wbt');
          router.replace('/(tabs)');
          return;
        }
        const parsed = parseJsaLaunchUrl(url);
        if (parsed.ok) {
          await saveLaunchContext(parsed.value);
        } else {
          await markGovernedReturnRequired('wbt');
        }
      } catch {
        await markGovernedReturnRequired('wbt');
      }
      router.replace('/(tabs)');
    })();
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
