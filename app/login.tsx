// app/login.tsx
// SSO deep link handler — receives hash + name from WB Suite hub app
// URL: jsaapp://login?hash={passcodeHash}&name={displayName}
//
// This route exists solely so Expo Router can match the deep link URL.
// It extracts the SSO params and delegates to AuthContext.ssoLogin(),
// then redirects to the main app.

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from './contexts/AuthContext';

export default function SSOLoginRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ hash?: string; name?: string }>();
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

    console.log('[JSA-SSO] Validating SSO for:', name);

    try {
      await ssoLogin(hash, name);
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
          <ActivityIndicator size="large" color="#F5A623" />
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
