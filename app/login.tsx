// app/login.tsx
// SSO deep link handler — receives hash + name + shiftId from WB Suite hub app.
// Legacy hash deep links are refused; governed SSO uses the callback exchange.
//
// This route exists solely so Expo Router can match the deep link URL.
// Legacy hash/name fields are ignored; Suite SSO uses the authorization-code
// callback and governed session installation.
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
import { beginSuiteCardAuthorization } from '../services/sso/jsaSuiteCardLive';

export default function SSOLoginRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    hash?: string;
    name?: string;
    truck?: string;
    trailer?: string;
    shiftId?: string;
  }>();
  const [status, setStatus] = useState<'validating' | 'error'>('validating');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    handleSSO();
  }, []);

  const handleSSO = async () => {
    console.log('[JSA-SSO] Starting governed Suite authorization');

    try {
      // hash/name/truck/trailer/shiftId are never consumed. The installed
      // governed session and canonical shift authority are server-authored.
      void params;
      const result = await beginSuiteCardAuthorization();
      if (result === 'usable') router.replace('/(tabs)');
      else if (result === 'fail_closed') {
        setStatus('error');
        setErrorMsg('Secure WellBuilt sign-in could not be verified. Return to WellBuilt and try again.');
      }
    } catch (error: any) {
      console.error('[JSA-SSO] Validation error:', error);
      setStatus('error');
      setErrorMsg('Secure WellBuilt sign-in could not be verified. Return to WellBuilt and try again.');
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
