import { Tabs, usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Keyboard, Pressable, Text } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors } from '@/constants/colors';
import MoreMenu from '@/components/MoreMenu';
import BottomActionBar from '@/components/BottomActionBar';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';

function BottomBar({ state, navigation }: BottomTabBarProps) {
  const { t } = useLanguage();
  const { accent } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [openJsas, setOpenJsas] = useState<any[]>([]);
  const refreshOpenJsas = useCallback(() => {
    let current = true;
    void import('../../services/jsaRecord')
      .then(({ ownOpenJsaRecords }) => ownOpenJsaRecords())
      .then(result => { if (current) setOpenJsas(result.rows); })
      .catch(() => { if (current) setOpenJsas([]); });
    return () => { current = false; };
  }, []);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(refreshOpenJsas, [refreshOpenJsas, pathname, state.index]);
  if (keyboardOpen) return null;
  const historyRoute = state.routes.find(route => route.name === 'history')!;
  const indexRoute = state.routes.find(route => route.name === 'index')!;
  const historySelected = state.routes[state.index].key === historyRoute.key;
  const indexSelected = state.routes[state.index].key === indexRoute.key;
  const openLabel = openJsas.length === 1 ? 'Current JSA' : openJsas.length > 1 ? 'Current JSAs' : 'Saved JSAs';
  const openColor = openJsas.length ? colors.success : historySelected ? accent : colors.textMuted;
  return <BottomActionBar>
    <Pressable accessibilityRole="button" accessibilityLabel={t(openLabel)}
      style={{ width: 88, maxWidth: '100%', height: 52, alignItems: 'center', justifyContent: 'center' }}
      onPress={() => {
        if (openJsas.length === 1) router.push({ pathname: '/jsa-record', params: { id: openJsas[0].id } } as any);
        else if (openJsas.length > 1) router.push('/open-jsas' as any);
        else navigation.navigate(historyRoute.name, historyRoute.params);
      }}>
      <IconSymbol size={26} name={openJsas.length ? 'shield.checkered' : 'clock.fill'} color={openColor} />
      <Text numberOfLines={1} style={{ color: openColor, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{t(openLabel)}</Text>
    </Pressable>
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: indexSelected }} accessibilityLabel={t('New JSA')}
      style={{ width: 88, maxWidth: '100%', height: 52, alignItems: 'center', justifyContent: 'center' }}
      onLongPress={() => navigation.emit({ type: 'tabLongPress', target: indexRoute.key })}
      onPress={() => {
        const event = navigation.emit({ type: 'tabPress', target: indexRoute.key, canPreventDefault: true });
        if (!indexSelected && !event.defaultPrevented) navigation.navigate(indexRoute.name, indexRoute.params);
      }}>
      <IconSymbol size={26} name="plus.circle.fill" color={indexSelected ? accent : colors.textMuted} />
      <Text numberOfLines={1} style={{ color: indexSelected ? accent : colors.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{t('New JSA')}</Text>
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
