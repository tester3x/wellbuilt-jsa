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
import ShiftAuthorityGate from '../components/ShiftAuthorityGate';
import {
  decideUnauthenticatedOverlay,
  type GovernedReturnTarget,
} from '../services/shiftAuthority';
import {
  isCurrentShiftVerified,
  readGovernedReturnTarget,
  markGovernedReturnRequired,
  subscribeShiftVerified,
} from '../services/shiftAuthorityStore';
import { WBT_READ_REQUEST_KEY } from '../services/wbtReadRequest';

const FIREBASE_DB = 'https://wellbuilt-sync-default-rtdb.firebaseio.com';

/**
 * Check if WB S wrote a logoutAt signal to RTDB that should fire a cascade
 * logout for the local session.
 *
 * Mirrors WB T's consumed-logoutAt baseline approach (post-2026-04-30
 * redesign). Each session keeps a `jsa_lastConsumedLogoutAt` baseline
 * snapshot in SecureStore. ANY logoutAt strictly newer than the baseline
 * fires the cascade and bumps the baseline so subsequent foregrounds
 * don't re-fire on the same signal. ISO-8601 sorts lex == chrono so we
 * compare strings directly.
 *
 * Cascade-logout policy (post-2026-04-30): WB S is the global logout
 * authority for the matching driverHash. Both manual AND SSO sessions
 * honor the signal — the prior `authMethod !== 'sso'` gate was removed
 * to match the same change made in WB T (4/27/2026 entry). If a driver
 * is logged in to JSA on the same hash that WB S logs out, JSA also
 * logs out, regardless of how JSA was logged in.
 */
async function checkRtdbLogoutSignal(): Promise<boolean> {
  try {
    const hash = await SecureStore.getItemAsync('jsa_passcodeHash');
    if (!hash) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(`${FIREBASE_DB}/drivers/approved/${hash}/logoutAt.json`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return false;

    const logoutAtRaw = await resp.json();
    const logoutAt = (typeof logoutAtRaw === 'string' && logoutAtRaw.length > 0) ? logoutAtRaw : null;
    if (!logoutAt) return false;

    const baseline = await SecureStore.getItemAsync('jsa_lastConsumedLogoutAt');

    if (!baseline) {
      // Race window: saveDriverSession's baseline seed never landed
      // (offline at login). Conservative fallback — compare to NOW.
      const nowIso = new Date().toISOString();
      const fireOnSeed = logoutAt > nowIso;
      await SecureStore.setItemAsync('jsa_lastConsumedLogoutAt', fireOnSeed ? logoutAt : nowIso);
      return fireOnSeed;
    }

    const shouldLogout = logoutAt > baseline;
    if (shouldLogout) {
      await SecureStore.setItemAsync('jsa_lastConsumedLogoutAt', logoutAt);
    }
    return shouldLogout;
  } catch {
    return false;
  }
}
import { colors } from '../constants/colors';

// Module-scoped session flag — once "Remind me later" is tapped, the
// unfinished-JSA modal stays suppressed for the remainder of this app
// process even if the persistent AsyncStorage write loses or the modal
// re-mounts. Cold-start of the app process resets the flag (intended:
// at cold start we re-evaluate scope + persisted dismiss). Pairs with
// the per-shift persistent key written by onClose below.
let sessionUnfinishedSuppressed = false;

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
  const [unauthSurface, setUnauthSurface] = useState<'legacy_login' | 'unverified_gate'>('legacy_login');
  const [returnTarget, setReturnTarget] = useState<GovernedReturnTarget>('suite');

  const checkUnfinishedJsas = async () => {
    try {
      const session = await getDriverSession();
      if (!session?.passcodeHash) return;

      const todayStr = new Date().toISOString().slice(0, 10);
      const activeShiftId = await AsyncStorage.getItem('wellbuilt-current-shift-id').catch(() => null);

      // "Remind me later" persistence — keyed by current scope so a new
      // shift on the same calendar day re-arms the prompt (driver
      // explicitly started a new shift; we shouldn't carry over the
      // prior shift's dismissal). Falls back to date keying when no
      // shift is active.
      //
      // Two layers of suppression:
      //   1. session-level (module-scoped sessionUnfinishedSuppressed)
      //      — survives modal re-mount within the same app process,
      //        immune to AsyncStorage write failures.
      //   2. persistent (AsyncStorage @jsa/unfinishedDismissed:{scope})
      //      — survives app restart within the same shift/day.
      const dismissKey = activeShiftId
        ? `@jsa/unfinishedDismissed:${activeShiftId}`
        : `@jsa/unfinishedDismissed:date:${todayStr}`;
      const persistedDismissAt = await AsyncStorage.getItem(dismissKey).catch(() => null);
      const remindLaterSuppressed = sessionUnfinishedSuppressed || !!persistedDismissAt;

      const list = await getUnfinishedJsas(session.passcodeHash);

      // Strict scope filter — fixes fresh-install bug where prior-date
      // unfinished JSAs surfaced during an active shift. The active
      // screen shows ONLY current-shift records; prior days remain
      // accessible from the Saved JSAs tab.
      //
      //   activeShiftId present → keep j.shiftId === activeShiftId
      //   activeShiftId absent  → keep j.date    === todayStr
      //
      // Records failing the predicate are counted as historicalSuppressed
      // (not deleted, not auto-discarded — just hidden from the active
      // surface, accessible via Saved JSAs).
      const filtered: UnfinishedJsa[] = [];
      let historicalSuppressed = 0;
      for (const j of list) {
        const passes = activeShiftId
          ? !!j.shiftId && j.shiftId === activeShiftId
          : j.date === todayStr;
        if (passes) filtered.push(j);
        else historicalSuppressed++;
      }

      const willShow = filtered.length > 0 && !remindLaterSuppressed;
      console.log(JSON.stringify({
        tag: '[JSA-unfinished.modal]',
        totalFetched: list.length,
        currentScopeShown: filtered.length,
        historicalSuppressed,
        remindLaterSuppressed,
        currentShiftId: activeShiftId || null,
        currentDate: todayStr,
        willShow,
      }));

      setUnfinished(filtered);
      setShowUnfinished(willShow);
    } catch (err) {
      console.warn('[JSA] checkUnfinishedJsas failed:', err);
    }
  };

  const maybeShowWelcome = async () => {
    try {
      const session = await getDriverSession();
      if (!session) return;
      // Welcome/Get Started must not expose an unverified cached shift.
      if (!(await isCurrentShiftVerified())) return;
      const todayStr = new Date().toISOString().slice(0, 10);
      const shownDate = await AsyncStorage.getItem('@jsa/welcomeShownDate');
      if (shownDate === todayStr) return; // already shown today
      const fullName = session.legalName || session.displayName || '';
      const firstName = fullName.trim().split(/\s+/)[0] || '';
      setWelcomeName(firstName);
      setShowWelcome(true);
    } catch {}
  };

  const resolveUnauthSurface = async () => {
    try {
      const target = await readGovernedReturnTarget();
      const pending = await AsyncStorage.getItem(WBT_READ_REQUEST_KEY);
      const returnTo = await AsyncStorage.getItem('jsa_returnTo');
      const surface = decideUnauthenticatedOverlay({
        governedReturnRequired: !!target,
        hasPendingRequest: !!pending,
        isGovernedLaunch: returnTo === 'wbt' || returnTo === 'wbs' || returnTo === 'wellbuilt-suite',
      });
      setUnauthSurface(surface);
      if (target) setReturnTarget(target);
    } catch {
      setUnauthSurface('legacy_login');
    }
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
    } else {
      setShowWelcome(false);
      resolveUnauthSurface();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    return subscribeShiftVerified(() => {
      maybeShowWelcome();
    });
  }, []);

  useEffect(() => {
    resolveUnauthSurface();
  }, []);

  // Direct-icon / cold start: begin Suite PKCE automatically. Never
  // substitute manual login for governed auth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { loadGovernedSession, mintAttempt } = await import('../services/sso/jsaRuntime');
        const { decideBootstrap } = await import('../services/sso/jsaBootstrap');
        const { isLegacyJsaLaunchUrl } = await import('../services/sso/jsaLaunch');
        const { buildAuthorizeUrl } = await import('../services/sso/jsaPkce');
        const url = await Linking.getInitialURL();
        const session = await loadGovernedSession();
        const decision = decideBootstrap({
          hasPersistedSession: !!session || isAuthenticated,
          incomingUrl: url,
          isCallback: !!url && url.includes('sso-callback'),
          isLaunch: !!url && url.includes('://start'),
          isLegacyLaunch: !!url && isLegacyJsaLaunchUrl(url),
          isDirectIcon: !url,
        });
        if (cancelled) return;
        if (decision.action === 'open_suite_authorize') {
          const Crypto = await import('expo-crypto');
          const attempt = await mintAttempt({
            randomBytes: (n) => Crypto.getRandomBytesAsync(n),
            sha256Hex: async (s) => {
              const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
              return hex;
            },
            nowMs: () => Date.now(),
          });
          await Linking.openURL(buildAuthorizeUrl(attempt));
        }
      } catch {
        await resolveUnauthSurface();
      }
    })();
    return () => { cancelled = true; };
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

        if (event.url?.includes('sso-callback')) {
          const { parseJsaSsoCallbackUrl, consumeCallback, markConsumed } = await import('../services/sso/jsaPkce');
          const { loadAttempt, saveAttempt, clearAttempt, saveGovernedSession } = await import('../services/sso/jsaRuntime');
          const { validateExchangePayload, sessionFromExchange } = await import('../services/sso/jsaSession');
          const parsedCb = parseJsaSsoCallbackUrl(event.url);
          const attempt = await loadAttempt();
          const consumed = consumeCallback(attempt, parsedCb, Date.now());
          if (!consumed.ok || consumed.status !== 'success') {
            await markGovernedReturnRequired('suite');
            setSsoInProgress(false);
            return;
          }
          if (attempt) await saveAttempt(markConsumed(attempt));
          try {
            const { getApp } = await import('firebase/app');
            const { getFunctions, httpsCallable } = await import('firebase/functions');
            const callable = httpsCallable(getFunctions(getApp()), 'ssoExchangeAuthorizationCode', { timeout: 15000 });
            const result = await callable({
              protocolVersion: 1,
              audience: 'wellbuilt-jsa',
              code: consumed.code,
              codeVerifier: consumed.verifier,
            });
            const payload = validateExchangePayload(result.data);
            if (!payload) {
              await markGovernedReturnRequired('suite');
              await clearAttempt();
              setSsoInProgress(false);
              return;
            }
            await saveGovernedSession(sessionFromExchange(payload, null));
            await clearAttempt();
          } catch {
            await markGovernedReturnRequired('suite');
          }
          setSsoInProgress(false);
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

        // JSA auto-fill from WB T / WB S / WB M: jsaapp://start?driverName=...&wellName=...&returnTo=...
        if (parsed.path === 'start' && parsed.queryParams) {
          console.log('[JSA] Start deep link received with params:', Object.keys(parsed.queryParams));
          // SSO login if hash provided
          let ssoOk = false;
          if (parsed.queryParams.hash && parsed.queryParams.name) {
            ssoOk = await ssoLogin(parsed.queryParams.hash as string, parsed.queryParams.name as string);
          }
          const explicitShift = typeof parsed.queryParams.shiftId === 'string'
            ? parsed.queryParams.shiftId
            : '';
          const governed = !!(
            parsed.queryParams.hash ||
            parsed.queryParams.returnTo === 'wbt' ||
            parsed.queryParams.returnTo === 'wellbuilt-suite' ||
            parsed.queryParams.returnTo === 'wbs'
          );
          if (governed && (!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(explicitShift) || (parsed.queryParams.hash && parsed.queryParams.name && !ssoOk))) {
            await markGovernedReturnRequired(parsed.queryParams.returnTo === 'wbt' ? 'wbt' : 'suite');
          }
          // Store params for auto-fill — home screen reads these on mount
          await AsyncStorage.setItem('jsa_autofill', JSON.stringify(parsed.queryParams));
          // ALSO persist jsa_returnTo here (in addition to (tabs)/index.tsx
          // line 180 which reads from autofill on hydration). This is the
          // canonical write path for the source-app return label — landing
          // here from WB T was previously relying on autofill consumption,
          // which was gated on autofillConsumedRef and only fired once per
          // mount. Writing the key immediately at deep-link-arrival makes
          // the label correct regardless of (tabs) mount state.
          if (parsed.queryParams.returnTo) {
            await AsyncStorage.setItem('jsa_returnTo', String(parsed.queryParams.returnTo)).catch(() => {});
          }
          // WB-T fresh-read RECEIPT request (8/6) — same capture as the
          // cold-start route: valid → replace stored context (explicit
          // restart); absent/invalid → clear it (one request can never be
          // satisfied by another flow's parameters).
          {
            const { captureReadRequestFromParams } = await import('../services/wbtReadRequest');
            await captureReadRequestFromParams(parsed.queryParams as Record<string, unknown>);
          }
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
        const qp = parsed.queryParams || {};
        let ssoOk = false;
        if (qp.hash && qp.name) {
          // SSO login included — suppress login overlay while auth settles
          ssoOk = await ssoLogin(qp.hash as string, qp.name as string);
        }
        // Persist returnTo immediately on cold start too (mirrors warm-
        // start handler above). start.tsx also writes this, but it only
        // fires when start.tsx is the routed screen — _layout.tsx warm
        // start path bypasses start.tsx entirely.
        if (qp.returnTo) {
          await AsyncStorage.setItem('jsa_returnTo', String(qp.returnTo)).catch(() => {});
        }
        const explicitShift = typeof qp.shiftId === 'string' ? qp.shiftId : '';
        const governed = !!(qp.hash || qp.returnTo === 'wbt' || qp.returnTo === 'wellbuilt-suite' || qp.returnTo === 'wbs');
        if (governed && (!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(explicitShift) || (qp.hash && qp.name && !ssoOk))) {
          await markGovernedReturnRequired(qp.returnTo === 'wbt' ? 'wbt' : 'suite');
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
                // Two-layer "Remind me later" suppression:
                //   1. Module-scoped session flag — instant, immune to
                //      AsyncStorage failure, and short-circuits any
                //      subsequent re-check within this app process.
                //   2. Persistent AsyncStorage flag keyed by the
                //      current scope (shiftId when active, date when
                //      not) so the suppression survives app restart
                //      but a NEW shift legitimately re-arms the prompt.
                sessionUnfinishedSuppressed = true;
                const todayStr = new Date().toISOString().slice(0, 10);
                const activeShiftId = await AsyncStorage.getItem('wellbuilt-current-shift-id').catch(() => null);
                const dismissKey = activeShiftId
                  ? `@jsa/unfinishedDismissed:${activeShiftId}`
                  : `@jsa/unfinishedDismissed:date:${todayStr}`;
                await AsyncStorage.setItem(dismissKey, new Date().toISOString()).catch(() => {});
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

          {/* Unauthenticated overlay. A governed launch / leftover SSO
              session that could not be verified must NOT fall through to
              manual name/passcode as a substitute for governed auth. */}
          {mode !== 'checking' && !isAuthenticated && !ssoInProgress && (
            <View style={styles.overlay}>
              {unauthSurface === 'unverified_gate' ? (
                <ShiftAuthorityGate variant="overlay" returnTarget={returnTarget} />
              ) : (
                <LoginScreen />
              )}
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
