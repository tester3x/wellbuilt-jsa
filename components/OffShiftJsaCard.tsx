import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { BrandedAlert } from '../services/brandedAlert';
import {useJsaHome} from '../app/contexts/JsaHomeContext';
import {useLanguage} from '../app/contexts/LanguageContext';

const callPeriod = (body: object) =>
  httpsCallable<object, { periodId: string | null; ended?: boolean }>(
    getFunctions(getApp()), 'jsaOffShiftPeriod',
  )(body);

export default function OffShiftJsaCard() {
  const home = useJsaHome();
  const {t} = useLanguage();
  const [busy, setBusy] = useState(false);
  const periodId = home.state?.shiftState === 'none' && home.state.action === 'resume'
    ? home.state.jsaPeriodId : null;
  if (!periodId) return null;
  async function end() {
    setBusy(true);
    try {
      const { data } = await callPeriod({ operation: 'end', periodId });
      if (data.ended !== true || data.periodId !== periodId) throw Error('Close unconfirmed');
      await home.refresh(true);
    } catch {
      BrandedAlert.alert('End JSA', 'The JSA close could not be confirmed. Reopen this screen and retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
      <Text>{t('Open off-shift JSA')}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() =>
        BrandedAlert.alert('End JSA?', 'Your signed JSA stays available in Saved JSAs.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End JSA', onPress: () => void end() },
        ])
      }><Text>{t(busy ? 'Ending…' : 'End JSA')}</Text></TouchableOpacity>
    </View>
  );
}
