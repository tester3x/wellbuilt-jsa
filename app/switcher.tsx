import React from 'react';
import { useRouter } from 'expo-router';
import AppSwitcher from '../components/AppSwitcher';
export default function SwitcherScreen() {
  const router = useRouter();
  return <AppSwitcher presentation="modal" visible selfScheme="jsaapp" getIdentity={async () => null}
    onClose={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} />;
}
