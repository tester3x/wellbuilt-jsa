import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '../app/contexts/LanguageContext';
import AppSwitcher from './AppSwitcher';
import { colors } from '../constants/colors';

export default function MoreMenu({ placement = 'header' }: { placement?: 'header' | 'bottom' }) {
  const [visible, setVisible] = useState(false);
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('More')}
      onPress={() => setVisible(true)} style={[styles.trigger, placement === 'bottom' && { width: 88, maxWidth: '100%', height: 52 }]}>
      <Text style={styles.dots}>•••</Text>
      {placement === 'bottom' && <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{t('More')}</Text>}
    </Pressable>
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('Close menu')} onPress={() => setVisible(false)}>
        <View style={[styles.menu, placement === 'bottom' ? { bottom: Math.max(insets.bottom, 8) + 64 } : { top: insets.top + 52 }]}>
          {([{ label: 'Open JSAs', route: '/open-jsas', icon: 'shield-checkmark-outline' }, { label: 'New JSA', route: '/(tabs)', icon: 'add-circle-outline' }, { label: 'Saved JSAs', route: '/(tabs)/history', icon: 'time-outline' },
            { label: 'Settings', route: '/settings', icon: 'settings-outline' }, { label: 'Switcher', route: '/switcher', icon: 'apps-outline' }] as const).map(item =>
            <Pressable key={item.route} accessibilityRole="button" style={styles.item} onPress={() => {
              setVisible(false);
              if (item.label === 'Switcher') setSwitcherVisible(true);
              else if (item.label === 'New JSA') router.push({ pathname: '/(tabs)', params: { newStandalone: String(Date.now()) } } as Href);
              else router.push(item.route as Href);
            }}><Ionicons name={item.icon} size={20} color={colors.primaryDark}/><Text style={styles.label}>{t(item.label)}</Text></Pressable>
          )}
        </View>
      </Pressable>
    </Modal>
    {switcherVisible && <AppSwitcher presentation="modal" visible selfScheme="jsaapp" getIdentity={async () => null} onClose={() => setSwitcherVisible(false)} />}
  </>;
}

const styles = StyleSheet.create({
  trigger: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dots: { color: colors.textDark, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  menu: { position: 'absolute', right: 12, width: 190, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, elevation: 8 },
  item: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, paddingHorizontal: 16 },
  label: { color: colors.textDark, fontSize: 16, fontWeight: '600', textAlign: 'right' },
});
