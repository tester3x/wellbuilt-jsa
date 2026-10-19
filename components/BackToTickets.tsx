import React, { useCallback, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../app/contexts/AuthContext';
import { useLanguage } from '../app/contexts/LanguageContext';
import { ticketsReturnForCurrentOwner } from '../services/jsaStayReturn';
import { BrandedAlert } from '../services/brandedAlert';
import { colors } from '../constants/colors';
export default function BackToTickets() {
  const { session } = useAuth(), { t } = useLanguage();
  const [url, setUrl] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true; setUrl(null);
    void ticketsReturnForCurrentOwner().then(value => { if (active) setUrl(value); });
    return () => { active = false; };
  }, [session?.uid, session?.generation]));
  if (!url) return <View style={{ width: 88, height: 52 }} />;
  return <Pressable accessibilityRole="button" accessibilityLabel={t('Back to Tickets')}
    style={{ width: 88, maxWidth: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center' }}
    onPress={() => { void ticketsReturnForCurrentOwner().then(current => {
      if (current) return Linking.openURL(current);
    }).catch(() => BrandedAlert.alert(t('Could not open Tickets'), t('Please retry.'))); }}>
    <Ionicons name="arrow-back-circle-outline" size={26} color={colors.textMuted}/>
    <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' }}>{t('Back to Tickets')}</Text>
  </Pressable>;
}
