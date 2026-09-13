import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Keyboard, Pressable, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/constants/colors';
import MoreMenu from '@/components/MoreMenu';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

function BottomBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();
  const { accent } = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardOpen) return null;
  return <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderTopColor: colors.border,
    borderTopWidth: 1, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8) }}>
    {([{ name: 'history', label: 'Saved JSAs', icon: 'clock.fill' },
      { name: 'index', label: 'Job Details', icon: 'house.fill' }] as const).map(item => {
      const route = state.routes.find(route => route.name === item.name)!;
      const selected = state.routes[state.index].key === route.key;
      const color = selected ? accent : colors.textMuted;
      return <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected }}
        accessibilityLabel={t(item.label)} style={{ flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' }}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        onPress={() => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        }}>
        <IconSymbol size={26} name={item.icon} color={color} />
        <Text numberOfLines={1} style={{ color, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{t(item.label)}</Text>
      </Pressable>;
    })}
    <MoreMenu placement="bottom" />
  </View>;
}

export default function TabLayout() {
  return <Tabs initialRouteName="index" screenOptions={{ headerShown: false }} tabBar={props => <BottomBar {...props} />}>
    <Tabs.Screen name="history" />
    <Tabs.Screen name="index" />
  </Tabs>;
}
