import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './contexts/AuthContext';
import { colors } from '../constants/colors';

/**
 * Deep link landing screen for jsaapp://start?driverName=...&wellName=...&...
 * Stores params for auto-fill, handles SSO login if hash present, then redirects to home.
 */
export default function StartScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { ssoLogin } = useAuth();

  useEffect(() => {
    (async () => {
      try {
        // SSO login if hash provided
        if (params.hash && params.name) {
          await ssoLogin(params.hash as string, params.name as string);
        }
        // shiftId — scopes the JSA to the current shift. WB S mints it at
        // Start Shift; closing a shift clears it; the next shift gets a new
        // id so the JSA doesn't bleed across shifts. Stored under the same
        // key WB T uses so all three apps look at the same scope.
        if (params.shiftId) {
          await AsyncStorage.setItem('wellbuilt-current-shift-id', String(params.shiftId));
          console.log('[JSA-SSO] shiftId persisted via /start:', params.shiftId);
        } else {
          console.warn('[JSA-SSO] /start route — NO shiftId in URL params — JSA scope will fall back to date');
        }
        // Store params for auto-fill — home screen reads these on mount
        await AsyncStorage.setItem('jsa_autofill', JSON.stringify(params));
        // Persist returnTo separately so signoff can prompt "Return to Work" even
        // after jsa_autofill gets cleared by the form consumer.
        if (params.returnTo) {
          await AsyncStorage.setItem('jsa_returnTo', String(params.returnTo));
        }
        console.log('[JSA] Start screen — stored autofill params, redirecting to home');
      } catch (err) {
        console.error('[JSA] Start screen error:', err);
      }
      // Navigate to home tab
      router.replace('/(tabs)');
    })();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
