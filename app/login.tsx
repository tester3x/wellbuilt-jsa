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

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLanguage } from './contexts/LanguageContext';

export default function SSOLoginRoute() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<'validating' | 'error'>('validating');

  useEffect(() => {
    // Authorization is owned by the root deep-link handler. Keeping a
    // second owner here caused Android's retained task intent to start a
    // fresh Suite authorization every time the process reopened. If the
    // root cannot settle the route, stop presenting an endless spinner.
    const timeout = setTimeout(() => setStatus('error'), 15000);
    return () => clearTimeout(timeout);
  }, []);
  // hash/name/truck/trailer/shiftId are never consumed. The installed
  // governed session and canonical shift authority are server-authored.

  return (
    <View style={styles.container}>
      {status === 'validating' && (
        <>
          <ActivityIndicator size="large" color="#DAA520" />
          <Text style={styles.text}>{t('Signing in from WellBuilt Suite...')}</Text>
        </>
      )}
      {status === 'error' && (
        <Text style={styles.errorText}>{t('Secure WellBuilt sign-in could not be verified. Return to WellBuilt and try again.')}</Text>
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
});
