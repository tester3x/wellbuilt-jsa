import React from 'react';
import { ScrollView } from 'react-native';
import AppSwitcher from '../components/AppSwitcher';

export default function SwitcherScreen() {
  return <ScrollView contentContainerStyle={{ padding: 16 }}>
    <AppSwitcher presentation="list" selfScheme="jsaapp" getIdentity={async () => null} />
  </ScrollView>;
}
