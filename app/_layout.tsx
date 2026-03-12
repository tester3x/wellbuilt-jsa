import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as NavigationBar from 'expo-navigation-bar';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import LoginScreen from '../components/LoginScreen';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

export const unstable_settings = {
  anchor: '(tabs)',
};

/** Renders the main navigation stack with dynamic accent-colored header */
function NavigationStack() {
  const { accent } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: accent },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: '600', color: '#FFFFFF' },
        headerBackTitleStyle: { fontSize: 12 },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="logout" options={{ headerShown: false }} />
      <Stack.Screen name="history" options={{ title: 'Saved JSAs', headerBackTitle: 'Back', headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

/** Inner component that gates on auth state + handles SSO deep links */
function AppContent() {
  const colorScheme = useColorScheme();
  const { mode, isAuthenticated, ssoLogin, logout } = useAuth();

  // Full-screen immersive mode — hide Android navigation bar
  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden');
      NavigationBar.setBehaviorAsync('overlay-swipe');
      NavigationBar.setBackgroundColorAsync('#00000000');
    }
  }, []);

  // Handle SSO deep links while app is running (warm start).
  // Cold-start deep links are handled by the /login route directly.
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      try {
        // Cascade logout from WB S
        if (event.url?.includes('logout')) {
          console.log('[JSA] Logout deep link received from WB S');
          logout();
          return;
        }

        const parsed = Linking.parse(event.url);
        if (parsed.path === 'login' && parsed.queryParams?.hash && parsed.queryParams?.name) {
          const hash = parsed.queryParams.hash as string;
          const name = parsed.queryParams.name as string;
          console.log('[JSA] SSO deep link received for:', name);
          ssoLogin(hash, name);
        }
      } catch (err) {
        console.error('[JSA] Deep link parse error:', err);
      }
    };

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Cold start: check if launched with logout deep link
    Linking.getInitialURL().then((url) => {
      if (url?.includes('logout')) {
        console.log('[JSA] Cold start logout deep link from WB S');
        logout();
      }
    });

    return () => subscription.remove();
  }, [ssoLogin, logout]);

  // IMPORTANT: Always render the Stack so Expo Router can match deep link routes.
  // If we return null or a plain View here, deep links like jsaapp://login?hash=...
  // get "Unmatched Route" because the navigation tree isn't mounted.
  // Splash/LoginScreen overlay on top when not authenticated.
  return (
    <ThemeProvider>
      <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View style={{ flex: 1 }}>
          <NavigationStack />

          {/* Splash overlay while checking auth */}
          {mode === 'checking' && (
            <View style={[styles.splash, styles.overlay]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}

          {/* Login overlay when not authenticated */}
          {mode !== 'checking' && !isAuthenticated && (
            <View style={styles.overlay}>
              <LoginScreen />
            </View>
          )}
        </View>
        <StatusBar style="light" />
      </NavThemeProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
});
