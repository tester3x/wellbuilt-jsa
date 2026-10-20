import React, { useCallback, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../app/contexts/AuthContext';
import { useLanguage } from '../app/contexts/LanguageContext';
import { ticketsReturnForCurrentOwner } from '../services/jsaStayReturn';
import { BrandedAlert } from '../services/brandedAlert';
import { colors } from '../constants/colors';
export default function BackToTickets() {
  const { session } = useAuth(), { t } = useLanguage();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    let active = true; setUrl(undefined);
    void ticketsReturnForCurrentOwner().then(value => { if (active) setUrl(value); }).catch(() => { if(active)setUrl(null); });
    return () => { active = false; };
  }, [session?.uid, session?.generation]));
  if (url===undefined) return <View style={{ width: 88, height: 52 }} />;
  const destination=url?'Tickets':'Suite';
  return <Pressable accessibilityRole="button" accessibilityLabel={t(url?'Back to Tickets':'Open Suite')}
    style={{ width: 88, maxWidth: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center' }}
    onPress={() => { void (async()=>{
      const current=await ticketsReturnForCurrentOwner();
      if(current){await Linking.openURL(current);return;}
      try{await Linking.openURL('wellbuilt-suite://');}
      catch(error){
        if(Platform.OS!=='android')throw error;
        await Linking.openURL('intent://#Intent;package=com.wellbuilt.suite;end');
      }
    })().catch(() => BrandedAlert.alert(t('Could not open')+' '+t(destination), t('Please retry.'))); }}>
    <Ionicons name="arrow-back-circle-outline" size={26} color={colors.textMuted}/>
    <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' }} numberOfLines={1}>{t(destination)}</Text>
  </Pressable>;
}
