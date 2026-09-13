import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../app/contexts/LanguageContext';
import { colors } from '../constants/colors';

export default function MoreMenu() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t('More')}
      onPress={() => setVisible(true)} style={styles.trigger}>
      <Text style={styles.dots}>•••</Text>
    </Pressable>
    <Modal transparent visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
      <Pressable style={styles.backdrop} accessibilityLabel={t('Close menu')} onPress={() => setVisible(false)}>
        <View style={[styles.menu, { top: insets.top + 52 }]}>
          {([{ label: 'Job Details', route: '/(tabs)' }, { label: 'Saved JSAs', route: '/(tabs)/history' },
            { label: 'Settings', route: '/settings' }, { label: 'Switcher', route: '/switcher' }] as const).map(item =>
            <Pressable key={item.route} accessibilityRole="button" style={styles.item} onPress={() => {
              setVisible(false);
              router.push(item.route as Href);
            }}><Text style={styles.label}>{t(item.label)}</Text></Pressable>
          )}
        </View>
      </Pressable>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  trigger: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  dots: { color: colors.textDark, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)' },
  menu: { position: 'absolute', right: 16, width: 208, backgroundColor: colors.card,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 4, elevation: 8 },
  item: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 18 },
  label: { color: colors.textDark, fontSize: 16, fontWeight: '600' },
});
