import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../app/contexts/ThemeContext';
import { useLanguage } from '../app/contexts/LanguageContext';
import { dismissBrandedAlert, subscribeBrandedAlert, type BrandedNotice } from '../services/brandedAlert';

export default function BrandedAlertHost() {
  const { accent } = useTheme();
  const { t } = useLanguage();
  const [notice, setNotice] = useState<BrandedNotice | null>(null);
  useEffect(() => subscribeBrandedAlert(setNotice), []);
  const dismiss = () => {
    if (!notice?.options?.cancelable) return;
    dismissBrandedAlert();
    notice.options.onDismiss?.();
  };
  return <Modal visible={!!notice} transparent animationType="fade" onRequestClose={dismiss}>
    <View style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.card}>
        <View style={[styles.header, { backgroundColor: accent }]}>
          <Text style={styles.brand}>WellBuilt · JSA</Text>
          <Text accessibilityRole="header" style={styles.title}>{notice?.title}</Text>
        </View>
        <ScrollView style={styles.message}><Text style={styles.copy}>{notice?.message}</Text></ScrollView>
        <View style={styles.actions}>{notice?.buttons.map((button, index) => <TouchableOpacity
          key={index} accessibilityRole="button" style={[styles.button, { borderColor: accent }, button.style !== 'cancel' && { backgroundColor: button.style === 'destructive' ? '#b3261e' : accent }]}
          onPress={() => { dismissBrandedAlert(); button.onPress?.(); }}>
          <Text style={[styles.buttonText, button.style === 'cancel' && { color: '#333' }]}>{t(button.text || 'OK')}</Text>
        </TouchableOpacity>)}</View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, maxHeight: '85%', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  header: { padding: 18, gap: 6 }, brand: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: { color: '#fff', fontSize: 21, fontWeight: '800' }, message: { flexGrow: 0, flexShrink: 1 },
  copy: { color: '#252525', padding: 20, fontSize: 16, lineHeight: 23 },
  actions: { padding: 16, paddingTop: 0, gap: 10, flexDirection: 'row', flexWrap: 'wrap' },
  button: { minHeight: 46, flexGrow: 1, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
