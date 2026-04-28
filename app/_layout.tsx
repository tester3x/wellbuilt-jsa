import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as NavigationBar from 'expo-navigation-bar';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import LoginScreen from '../components/LoginScreen';
import AppSwitcher from '../components/AppSwitcher';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDriverSession } from '../services/driverAuth';
import { getUnfinishedJsas, discardJsa, type UnfinishedJsa } from '../services/jsaStatus';
import UnfinishedJsasModal from '../components/UnfinishedJsasModal';
import WelcomeModal from '../components/WelcomeModal';

const FIREBASE_DB = 'https://wellbuilt-sync-default-rtdb.firebaseio.com';

/**
 * Check if WB S wrote a logoutAt signal to RTDB that's newer than our session.
 * Only applies to SSO sessions — manual logins are owned by the driver, not WB S.
 */
async function checkRtdbLogoutSignal(): Promise<boolean> {
  try {
    // Only SSO sessions respond to WB S cascade logout
    const authMethod = await SecureStore.getItemAsync('jsa_authMethod');
    if (authMethod !== 'sso') return false;

    const hash = await SecureStore.getItemAsync('jsa_passcodeHash');
    const verifiedAt = await SecureStore.getItemAsync('jsa_driverVerifiedAt');
    if (!hash || !verifiedAt) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${FIREBASE_DB}/drivers/approved/${hash}/logoutAt.json`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return false;

    const logoutAt = await resp.json();
    if (!logoutAt) return false;

    const logoutTime = new Date(logoutAt).getTime();
    const sessionTime = parseInt(verifiedAt, 10);
    return logoutTime > sessionTime;
  } catch {
    return false;
  }
}
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
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="logout" options={{ headerShown: false }} />
      <Stack.Screen name="start" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ title: 'Settings', headerBackTitle: 'Back', headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="steps" options={{ headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="ppe" options={{ headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="signoff" options={{ headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="completed" options={{ headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="viewJsa" options={{ title: 'JSA Details', headerBackTitle: 'Back', headerTitleAlign: 'center', headerTitleStyle: { fontWeight: '800', color: '#FFFFFF' } }} />
      <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
    </Stack>
  );
}

/** Inner component that gates on auth state + handles SSO deep links */
function AppContent() {
  const colorScheme = useColorScheme();
  const { mode, isAuthenticated, ssoLogin, logout } = useAuth();
  const router = useRouter();
  const [ssoInProgress, setSsoInProgress] = useState(true); // suppress login overlay until we check initial URL

  // Unfinished-JSA compliance modal — shown when driver has prior-day JSAs
  // with wells stamped but never signed off.
  const [unfinished, setUnfinished] = useState<UnfinishedJsa[]>([]);
  const [showUnfinished, setShowUnfinished] = useState(false);
  // Welcome modal — friendly greeting, shown once per calendar day on first
  // auth/foreground. Suppressed when the unfinished-JSA nag is showing.
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeName, setWelcomeName] = useState('');

  const checkUnfinishedJsas = async () => {
    try {
      const session = await getDriverSession();
      if (!session?.passcodeHash) return;
      // Path A (4/28): NEVER auto-surface old unfinished JSAs in fallback
      // mode (no active shiftId). Off-shift / post-logout / pre-shift
      // launches must be quiet. The compliance nag was producing false
      // positives in fallback because old date-keyed docs from prior days
      // were treated as "active need-to-finish" — but they can't actually
      // be resumed (only partial state was ever saved) so the prompt had
      // no useful path forward. Manual recovery (if needed) is a
      // separate surface, not auto-show.
      const activeShiftId = await AsyncStorage.getItem('wellbuilt-current-shift-id').catch(() => null);
      if (!activeShiftId) {
        console.log('[JSA] skipping unfinished-JSA modal — fallback mode (no active shift)');
        setUnfinished([]);
        setShowUnfinished(false);
        return;
      }
      // Path B (4/28): respect a per-day dismissal flag. "Remind me later"
      // / close persists for the day so foreground resume / reload doesn't
      // re-pop the same nag.
      const todayStr = new Date().toISOString().slice(0, 10);
      const dismissedDate = await AsyncStorage.getItem('@jsa/unfinishedDismissedDate').catch(() => null);
      if (dismissedDate === todayStr) {
        console.log('[JSA] unfinished-JSA modal dismissed for today — skipping');
        setShowUnfinished(false);
        return;
      }
      const list = await getUnfinishedJsas(session.passcodeHash);
      setUnfinished(list);
      if (list.length > 0) setShowUnfinished(true);
    } catch (err) {
      console.warn('[JSA] checkUnfinishedJsas failed:', err);
    }
  };

  const maybeShowWelcome = async () => {
    try {
      const session = await getDriverSession();
      if (!session) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      const shownDate = await AsyncStorage.getItem('@jsa/welcomeShownDate');
      if (shownDate === todayStr) return; // already shown today
      const fullName = session.legalName || session.displayName || '';
      const firstName = fullName.trim().split(/\s+/)[0] || '';
      setWelcomeName(firstName);
      setShowWelcome(true);
    } catch {}
  };

  // Clear SSO suppression once auth succeeds
  useEffect(() => {
    if (isAuthenticated && ssoInProgress) setSsoInProgress(false);
  }, [isAuthenticated, ssoInProgress]);

  // On successful auth, check for unfinished JSAs + welcome.
  useEffect(() => {
    if (isAuthenticated) {
      checkUnfinishedJsas();
      maybeShowWelcome();
    }
  }, [isAuthenticated]);

  // Full-screen immersive mode — hide Android navigation bar
  useEffect(() => {
    const hideNavBar = () => {
      if (Platform.OS === 'android') {
        NavigationBar.setVisibilityAsync('hidden');
        NavigationBar.setBehaviorAsync('overlay-swipe');
        NavigationBar.setBackgroundColorAsync('#00000000');
      }
    };
    hideNavBar();
    // Re-hide nav bar when app returns to foreground (deep links from WB S can re-show it)
    // Also check for RTDB logoutAt signal from WB S (silent cascade logout)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        hideNavBar();
        if (isAuthenticated) {
          checkRtdbLogoutSignal().then((shouldLogout) => {
            if (shouldLogout) {
              console.log('[JSA] RTDB logoutAt signal detected — auto-logging out');
              logout();
            }
          }).catch(() => {});
          // Re-surface unfinished-JSA nag on foreground
          checkUnfinishedJsas();
        }
      }
    });
    return () => appStateSub.remove();
  }, [isAuthenticated, logout]);

  // Handle SSO deep links while app is running (warm start).
  // Cold-start deep links are handled by the /login route directly.
  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      try {
        // Cascade logout from WB S — only if this session was started via SSO
        if (event.url?.includes('logout')) {
          const authMethod = await SecureStore.getItemAsync('jsa_authMethod');
          if (authMethod !== 'sso') {
            console.log('[JSA] Ignoring logout deep link — session is manual, not SSO');
            return;
          }
          console.log('[JSA] Logout deep link received from WB S — clearing SSO session');
          logout();
          return;
        }

        const parsed = Linking.parse(event.url);
        if (parsed.path === 'login' && parsed.queryParams?.hash && parsed.queryParams?.name) {
          const hash = parsed.queryParams.hash as string;
          const name = parsed.queryParams.name as string;
          console.log('[JSA] SSO deep link received for:', name);
          ssoLogin(hash, name);
          // SSO login comes from WB S — store returnTo so "Return to Work" goes back
          AsyncStorage.setItem('jsa_returnTo', 'wellbuilt-suite').catch(() => {});
        }

        // JSA auto-fill from WB T: jsaapp://start?driverName=...&wellName=...&...
        if (parsed.path === 'start' && parsed.queryParams) {
          console.log('[JSA] Start deep link received with params:', Object.keys(parsed.queryParams));
          // SSO login if hash provided
          if (parsed.queryParams.hash && parsed.queryParams.name) {
            await ssoLogin(parsed.queryParams.hash as string, parsed.queryParams.name as string);
          }
          // Store params for auto-fill — home screen reads these on mount
          await AsyncStorage.setItem('jsa_autofill', JSON.stringify(parsed.queryParams));
          // Navigate to home tab to start the JSA
          if (router.canDismiss()) router.dismissAll();
          router.replace('/(tabs)');
        }
      } catch (err) {
        console.error('[JSA] Deep link parse error:', err);
      }
    };

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Cold start: check initial URL for SSO login or logout
    Linking.getInitialURL().then(async (url) => {
      if (!url) {
        setSsoInProgress(false);
        return;
      }
      if (url.includes('logout')) {
        const authMethod = await SecureStore.getItemAsync('jsa_authMethod');
        if (authMethod === 'sso') {
          console.log('[JSA] Cold start logout deep link from WB S');
          logout();
        }
        setSsoInProgress(false);
        return;
      }
      // Start deep link — store params for auto-fill, let start.tsx handle redirect
      if (url.includes('/start')) {
        console.log('[JSA] Cold start deep link with params — start.tsx will handle');
        const parsed = Linking.parse(url);
        if (parsed.queryParams?.hash && parsed.queryParams?.name) {
          // SSO login included — suppress login overlay while auth settles
          await ssoLogin(parsed.queryParams.hash as string, parsed.queryParams.name as string);
        }
        setSsoInProgress(false);
        return;
      }
      // SSO login deep link — login.tsx handles the actual auth,
      // but we keep the overlay suppressed until auth state settles
      if (url.includes('login') && url.includes('hash=')) {
        console.log('[JSA] Cold start SSO deep link detected — suppressing login overlay');
        // SSO login comes from WB S — store returnTo so "Return to Work" goes back
        AsyncStorage.setItem('jsa_returnTo', 'wellbuilt-suite').catch(() => {});
        // login.tsx route will call ssoLogin; wait for auth state to update
        setTimeout(() => setSsoInProgress(false), 5000); // safety fallback
        return;
      }
      setSsoInProgress(false);
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
          {/* AppSwitcher — floating WB ecosystem app launcher */}
          {isAuthenticated && (
            <AppSwitcher
              badgeSource={require('../assets/images/app-switcher-badge.png')}
              selfScheme="jsaapp"
              getIdentity={async () => {
                const hash = await SecureStore.getItemAsync('jsa_passcodeHash');
                const name = await SecureStore.getItemAsync('jsa_driverName');
                return hash && name ? { hash, name } : null;
              }}
            />
          )}

          {/* Welcome greeting — shown once per day, unless an unfinished-JSA
              nag is also pending (compliance takes priority). */}
          {isAuthenticated && (
            <WelcomeModal
              visible={showWelcome && !showUnfinished}
              driverFirstName={welcomeName}
              onDismiss={() => {
                const todayStr = new Date().toISOString().slice(0, 10);
                AsyncStorage.setItem('@jsa/welcomeShownDate', todayStr).catch(() => {});
                setShowWelcome(false);
              }}
            />
          )}

          {/* Unfinished JSA compliance modal — shown on auth + on foreground */}
          {isAuthenticated && (
            <UnfinishedJsasModal
              visible={showUnfinished}
              list={unfinished}
              onResume={(date, wellNames) => {
                // Stash resume target so (tabs)/index.tsx can pre-fill form
                // with the correct date + wells.
                AsyncStorage.setItem(
                  'jsa_resume',
                  JSON.stringify({ date, wellNames }),
                ).catch(() => {});
                setShowUnfinished(false);
                if (router.canDismiss()) router.dismissAll();
                router.replace('/(tabs)');
              }}
              onDiscard={async (date, reason) => {
                const session = await getDriverSession();
                if (!session?.passcodeHash) return;
                const ok = await discardJsa(session.passcodeHash, date, reason);
                if (ok) {
                  setUnfinished(prev => prev.filter(j => j.date !== date));
                  // Auto-close modal if this was the last unfinished one
                  setTimeout(() => {
                    setUnfinished(current => {
                      if (current.length === 0) setShowUnfinished(false);
                      return current;
                    });
                  }, 0);
                }
              }}
              onClose={async () => {
                // Path B (4/28): persist dismiss for today so foreground/reload
                // doesn't re-pop the same nag. Naturally re-arms tomorrow.
                const todayStr = new Date().toISOString().slice(0, 10);
                await AsyncStorage.setItem('@jsa/unfinishedDismissedDate', todayStr).catch(() => {});
                setShowUnfinished(false);
              }}
            />
          )}

          {/* Splash overlay while checking auth */}
          {mode === 'checking' && (
            <View style={[styles.splash, styles.overlay]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}

          {/* Login overlay when not authenticated (suppressed during SSO cold start) */}
          {mode !== 'checking' && !isAuthenticated && !ssoInProgress && (
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
    <SafeAreaProvider>
      <LanguageProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
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
