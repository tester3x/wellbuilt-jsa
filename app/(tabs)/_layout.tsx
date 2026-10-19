import { Tabs, useRouter, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, Text } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/constants/colors';
import MoreMenu from '@/components/MoreMenu';
import BackToTickets from '@/components/BackToTickets';
import BottomActionBar from '@/components/BottomActionBar';
import {Ionicons} from '@expo/vector-icons';
import {useJsaHome} from '../contexts/JsaHomeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

export function BottomBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();
  const { accent } = useTheme();
  const router = useRouter();
  const home=useJsaHome();
  useFocusEffect(useCallback(()=>{void home.refresh();},[home.refresh]));
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardOpen) return null;
  const historyRoute = state.routes.find(route => route.name === 'history')!;
  const indexRoute = state.routes.find(route => route.name === 'index')!;
  const historySelected = state.routes[state.index].key === historyRoute.key;
  const indexSelected = state.routes[state.index].key === indexRoute.key;
  const resume=home.state?.action==='resume';
  const primaryLabel = resume?'Resume JSA':'New JSA';
  const disabled=home.checking||!home.state;
  const primaryColor = indexSelected ? accent : colors.textMuted;
  return <BottomActionBar>
    <BackToTickets />
    <Pressable accessibilityRole="button" accessibilityLabel={t(primaryLabel)}
      disabled={disabled} accessibilityState={{disabled}}
      style={{ width: 88, maxWidth: '100%', height: 52, alignItems: 'center', justifyContent: 'center' }}
      onPress={() => {
        if(resume)router.push('/current-jsa' as any);
        else router.navigate({ pathname: '/(tabs)', params: { newStandalone: String(Date.now()) } } as any);
      }}>
      {home.checking?<ActivityIndicator color={primaryColor}/>:<Ionicons size={26} name={resume?'play-circle-outline':'add-circle-outline'} color={primaryColor}/>}
      <Text numberOfLines={1} style={{ color: primaryColor, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{t(primaryLabel)}</Text>
    </Pressable>
    <MoreMenu placement="bottom" />
  </BottomActionBar>;
}

export default function TabLayout() {
  return <Tabs initialRouteName="index" screenOptions={{ headerShown: false }} tabBar={props => <BottomBar {...props} />}>
    <Tabs.Screen name="history" />
    <Tabs.Screen name="index" />
  </Tabs>;
}
