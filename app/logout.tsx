// app/logout.tsx
// Cascade logout handler — receives deep link from WB Suite hub app
// URL: jsaapp://logout
//
// This route exists so Expo Router can match the deep link on cold start.
// Warm start logout is handled in _layout.tsx's Linking listener.

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from './contexts/AuthContext';

export default function LogoutRoute() {
  const router = useRouter();
  const { logout } = useAuth();

  useEffect(() => {
    (async () => {
      console.log('[JSA] Logout route — clearing session');
      await logout();
      router.replace('/');
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Signing out...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
  },
  text: {
    color: '#9CA3AF',
    fontSize: 16,
    textAlign: 'center',
  },
});
