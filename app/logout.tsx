// app/logout.tsx
// Cascade logout handler — receives deep link from WB Suite hub app
// URL: jsaapp://logout
//
// This route exists so Expo Router can match the deep link on cold start.
// Warm start logout is handled in _layout.tsx's Linking listener.

import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from './contexts/AuthContext';

export default function LogoutRoute() {
  const router = useRouter();
  const { logout } = useAuth();
  const [failed, setFailed] = React.useState(false);

  const attempt = async () => {
    setFailed(false);
    const result = await logout();
    if (result.verified) router.replace('/login');
    else setFailed(true);
  };

  useEffect(() => {
    (async () => {
      console.log('[JSA] Logout route — clearing session');
      await attempt();
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{failed ? 'Sign out could not be verified.' : 'Signing out...'}</Text>
      {failed && <TouchableOpacity style={styles.retry} onPress={() => { void attempt(); }}><Text style={styles.retryText}>Retry sign out</Text></TouchableOpacity>}
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
  retry: { marginTop: 18, backgroundColor: '#F5A623', borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20 },
  retryText: { color: '#000', fontWeight: '700' },
});
