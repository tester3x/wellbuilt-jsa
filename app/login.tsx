// app/login.tsx
// SSO deep link handler — receives hash + name + shiftId from WB Suite hub app.
// URL: jsaapp://login?hash={passcodeHash}&name={displayName}&shiftId={shiftId}
//
// This route exists solely so Expo Router can match the deep link URL.
// It extracts the SSO params and delegates to AuthContext.ssoLogin(),
// then redirects to the main app.
//
// shiftId capture is CRITICAL — without it WB JSA falls back to a
// date-keyed JSA scope, which causes the previous shift's JSA to bleed
// into the new shift and blocks WB S's banner from clearing. Field
// failure 4/25/2026: this was the primary entry point users actually
// hit, but only /start captured shiftId. Now both routes do.

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './contexts/AuthContext';

export default function SSOLoginRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    hash?: string;
    name?: string;
    truck?: string;
    trailer?: string;
    shiftId?: string;
  }>();
  const { ssoLogin, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<'validating' | 'error'>('validating');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    handleSSO();
  }, []);

  // Once authenticated by ssoLogin, redirect to home
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    }
  }, [isAuthenticated]);

  const handleSSO = async () => {
    const { hash, name } = params;

    if (!hash || !name) {
      console.log('[JSA-SSO] Missing params — hash:', !!hash, 'name:', !!name);
      router.replace('/');
      return;
    }

    console.log('[JSA-SSO] Validating SSO launch', params.shiftId ? 'with shiftId' : 'without shiftId');

    try {
      // shiftId — scopes JSA to the active shift. Captured BEFORE ssoLogin
      // so that downstream JSA reads/writes during the auth flow already
      // see the correct scope. Without this, WB JSA falls back to today's
      // UTC date and writes a doc that bleeds into the previous shift.
      const explicitShift = params.shiftId && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(String(params.shiftId))
        ? String(params.shiftId)
        : '';
      if (explicitShift) {
        await AsyncStorage.setItem('wellbuilt-current-shift-id', explicitShift);
        console.log('[JSA-SSO] shiftId persisted');
      } else {
        console.warn('[JSA-SSO] NO shiftId in URL params — JSA scope will fall back to date');
      }

      // Store vehicle info from SSO params for the home screen
      if (params.truck) await AsyncStorage.setItem('@jsa/ssoTruck', params.truck);
      if (params.trailer) await AsyncStorage.setItem('@jsa/ssoTrailer', params.trailer);

      const ssoOk = await ssoLogin(hash, name);
      if (!explicitShift || !ssoOk) {
        const { markGovernedReturnRequired } = await import('../services/shiftAuthorityStore');
        await markGovernedReturnRequired('suite');
      }
      // ssoLogin will update auth state → the useEffect above handles redirect
    } catch (error: any) {
      console.error('[JSA-SSO] Validation error:', error);
      setStatus('error');
      setErrorMsg('Connection error. Please open the app manually.');
      setTimeout(() => router.replace('/'), 2000);
    }
  };

  return (
    <View style={styles.container}>
      {status === 'validating' && (
        <>
          <ActivityIndicator size="large" color="#DAA520" />
          <Text style={styles.text}>Signing in from WellBuilt Suite...</Text>
        </>
      )}
      {status === 'error' && (
        <>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <Text style={styles.subText}>Redirecting...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 32,
  },
  text: {
    color: '#9CA3AF',
    fontSize: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  subText: {
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
  },
});
