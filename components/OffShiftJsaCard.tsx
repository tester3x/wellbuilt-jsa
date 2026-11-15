import React, { useCallback, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { BrandedAlert } from '../services/brandedAlert';
import { loadUsableGovernedSession } from '../services/sso/jsaGovernedAuthLive';

const callPeriod = (body: object) =>
  httpsCallable<object, { periodId: string | null; ended?: boolean }>(
    getFunctions(getApp()), 'jsaOffShiftPeriod',
  )(body);

export default function OffShiftJsaCard() {
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => {
    let active = true;
    setPeriodId(null);
    void loadUsableGovernedSession().then(async session => {
      if (!session) return;
      const { data } = await callPeriod({ operation: 'read' });
      const current = await loadUsableGovernedSession();
      if (active && current?.uid === session.uid && current.generation === session.generation) {
        setPeriodId(data.periodId);
      }
    }).catch(error => console.warn('[JSA] Could not load off-shift JSA', error));
    return () => { active = false; };
  }, []));

  if (!periodId) return null;
  async function end() {
    setBusy(true);
    try {
      const { data } = await callPeriod({ operation: 'end', periodId });
      if (data.ended !== true || data.periodId !== periodId) throw Error('Close unconfirmed');
      setPeriodId(null);
    } catch {
      BrandedAlert.alert('End JSA', 'The JSA close could not be confirmed. Reopen this screen and retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
      <Text>Open off-shift JSA</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() =>
        BrandedAlert.alert('End JSA?', 'Your signed JSA stays available in Saved JSAs.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'End JSA', onPress: () => void end() },
        ])
      }><Text>{busy ? 'Ending…' : 'End JSA'}</Text></TouchableOpacity>
    </View>
  );
}
