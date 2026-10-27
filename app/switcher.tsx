import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { backToSuite } from '../services/hubNavigation';
/** Compatibility for old internal links; the app grid has been retired. */
export default function HubReturnScreen() {
  const router = useRouter();
  useEffect(() => { router.replace('/(tabs)'); void backToSuite(); }, [router]);
  return null;
}
