import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

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
function AuthenticatedApp({ colorScheme }: { colorScheme: ReturnType<typeof useColorScheme> }) {
  const { accent } = useTheme();
  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: accent },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '600', color: '#FFFFFF' },
          headerBackTitleStyle: { fontSize: 12 },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="history" options={{ title: 'Saved JSAs', headerBackTitle: 'Back', headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="light" />
    </NavThemeProvider>
  );
}

/** Inner component that gates on auth state + handles SSO deep links */
function AppContent() {
  const colorScheme = useColorScheme();
  const { mode, isAuthenticated, ssoLogin } = useAuth();

  // Handle SSO deep links: jsaapp://login?hash={hash}&name={name}
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      try {
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

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);
    return () => subscription.remove();
  }, [ssoLogin]);

  // While checking initial auth state, show splash
  if (mode === 'checking') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Not authenticated — show login screen
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // Authenticated — show the main app
  return (
    <ThemeProvider>
      <AuthenticatedApp colorScheme={colorScheme} />
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
});
