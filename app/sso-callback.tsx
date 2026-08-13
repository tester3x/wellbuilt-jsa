// Fixed jsaapp://sso-callback route. Parses status/code/state only.
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../constants/colors';

export default function JsaSsoCallbackRoute() {
  const router = useRouter();
  useEffect(() => {
    // Ownership lives in root _layout, which already claimed the URL.
    const t = setTimeout(() => router.replace('/(tabs)'), 50);
    return () => clearTimeout(t);
  }, [router]);
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
