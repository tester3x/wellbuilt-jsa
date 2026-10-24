import React, { useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../app/contexts/LanguageContext';
import { useTheme } from '../app/contexts/ThemeContext';
import { colors } from '../constants/colors';
import { JsaSummaryCard } from './jsa';
import MoreMenu from './MoreMenu';
import { jsaFlowFooterStyles as footer } from './jsaFlowFooterStyles';
import { useFormKeyboard } from './useFormKeyboard';
import {preparedReadPosition,nextPreparedRead} from '../services/preparedJsaNavigation';

type Item = { id: string; label: string };
type Step = { id: string; title: string; items: { hazard: string; controls: string }[] };
type Draft = { stepAcks: Record<string, boolean>; prepared: Record<string, boolean>; ppeSelected: Record<string, boolean>;
  printedName: string; signature: string; notes: string; screen?: 'steps' | 'ppe' | 'review'; stepIndex?: number };

/** The established JSA presentation over the protected prepared-request draft.
 * No completion authority, assessment selection or delivery logic lives here. */
export default function PreparedJsaForm({ request, assessment, draft, update, busy, error, onSign, onSubmit }: {
  request: any; assessment: { steps: Step[]; ppeItems: Item[]; preparedItems: Item[] };
  draft: Draft; update(next: Draft): Promise<void>; busy: boolean; error: string; onSign(): void; onSubmit(): void;
}) {
  const { t } = useLanguage(), { accent, emergencyContacts, companyContacts } = useTheme(), router = useRouter();
  const keyboard = useFormKeyboard(), notesRef = useRef<TextInput>(null), nameRef = useRef<TextInput>(null);
  const [openedAt] = useState(() => new Date());
  const [navigationError, setNavigationError] = useState('');
  const {screen,index,allSteps}=preparedReadPosition(assessment.steps,draft);
  const step = assessment.steps[index];
  const prepared = assessment.preparedItems.every(item => draft.prepared[item.id] === true);
  const title = screen === 'steps' ? 'Steps & Hazards' : screen === 'ppe' ? 'PPE Checklist' : 'Review & Submit';
  const change = (next: Draft) => { setNavigationError(''); void update(next).catch(() => setNavigationError(t('Could not save this draft. Please retry before leaving.'))); };
  const go = (next: Draft) => { change(next); keyboard.scrollRef.current?.scrollTo({ y: 0, animated: false }); };
  const back = () => screen === 'review' ? go({ ...draft, screen: 'ppe' }) : screen === 'ppe'
    ? go({ ...draft, screen: 'steps', stepIndex: Math.max(0, assessment.steps.length - 1) })
    : index > 0 ? go({ ...draft, stepIndex: index - 1, screen: 'steps' }) : router.back();
  const next = () => go(nextPreparedRead(assessment.steps,draft) as Draft);
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={styles.flex}>
    <Stack.Screen options={{ title: t(title), headerRight: () => <MoreMenu />,
      headerLeft: () => <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Back')} onPress={back} style={{ padding: 12 }}><Text style={{ fontSize: 25, color: '#fff' }}>←</Text></TouchableOpacity> }} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={keyboard.scrollRef} {...keyboard.scrollProps} style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: 8 + keyboard.height }]} keyboardShouldPersistTaps="always">
        <JsaSummaryCard compact driverName={String(request.job.driverName || request.job.driverDisplayName || draft.printedName || '')}
          truckNumber={String(request.job.truckNumber || '')} date={request.grant.policyDay}
          rows={[{ name: request.job.wellName, resolvedActivity: request.job.jobType }]} />
        {screen === 'steps' && step && <View style={styles.card}>
          <Text style={[styles.badge, { color: accent }]}>{t('Step')} {index + 1} {t('of')} {assessment.steps.length}</Text>
          <Text style={styles.sectionTitle}>{t(step.title)}</Text>
          {step.items.map((item, i) => <View key={i} style={styles.hazard}>
            <Text style={styles.body}><Text style={styles.bold}>{t('Hazard:')} </Text>{t(item.hazard)}</Text>
            <Text style={styles.body}><Text style={styles.bold}>{t('Controls:')} </Text>{t(item.controls)}</Text>
          </View>)}
        </View>}
        {screen === 'ppe' && <View style={styles.card}><Text style={styles.sectionTitle}>{t('PPE Required')}</Text>
          {assessment.ppeItems.map(item => <TouchableOpacity key={item.id} accessibilityRole="checkbox" accessibilityLabel={t(item.label)}
            accessibilityState={{ checked: draft.ppeSelected[item.id] === true }} style={styles.checkRow}
            onPress={() => change({ ...draft, ppeSelected: { ...draft.ppeSelected, [item.id]: !draft.ppeSelected[item.id] } })}>
            <View style={[styles.checkbox, { borderColor: accent, backgroundColor: draft.ppeSelected[item.id] ? accent : 'transparent' }]}>
              {draft.ppeSelected[item.id] && <Text style={styles.bold}>✓</Text>}</View><Text style={styles.checkLabel}>{t(item.label)}</Text>
          </TouchableOpacity>)}
        </View>}
        {screen === 'review' && <>
          <View style={styles.card}><Text style={styles.sectionTitle}>{t('I am prepared for work')}</Text>
            {assessment.preparedItems.map(item => <View key={item.id} style={styles.checkRow}>
              <Switch accessibilityLabel={t(item.label)} value={draft.prepared[item.id] === true}
                thumbColor={draft.prepared[item.id] ? accent : '#f4f3f4'} trackColor={{ false: colors.border, true: accent + '40' }}
                onValueChange={value => change({ ...draft, prepared: { ...draft.prepared, [item.id]: value } })} />
              <Text style={styles.checkLabel}>{t(item.label)}</Text></View>)}
          </View>
          {[[t('Emergency Contacts'), emergencyContacts], [t('Company Contacts'), companyContacts]].map(([label, contacts]: any) =>
            contacts.length > 0 && <View key={label} style={styles.card}><Text style={styles.sectionTitle}>{label}</Text>
              {contacts.map((contact: any, i: number) => <View key={i} style={styles.contact}><Text style={styles.checkLabel}>{contact.label}</Text><Text style={styles.body}>{contact.phone}</Text></View>)}
            </View>)}
          <View style={styles.card}><Text style={styles.sectionTitle}>{t('Additional Notes')}</Text>
            <TextInput ref={notesRef} onFocus={() => keyboard.focus(notesRef.current)} multiline style={[styles.input, styles.notes]}
              placeholder={t('Enter any notes')} value={draft.notes} onChangeText={notes => change({ ...draft, notes })} />
          </View>
          <View style={styles.card}><Text style={styles.sectionTitle}>{t('Driver Signature')}</Text>
            {draft.signature ? <><View style={styles.signature}><Image resizeMode="contain" style={styles.signatureImage}
              source={{ uri: draft.signature.startsWith('data:') ? draft.signature : 'data:image/png;base64,' + draft.signature }} /></View>
              <View style={styles.contact}><Text style={styles.muted}>{draft.printedName}</Text><TouchableOpacity onPress={onSign}><Text style={{ color: accent, fontWeight: '600' }}>{t('Re-sign')}</Text></TouchableOpacity></View></>
              : <TouchableOpacity style={styles.signPrompt} onPress={onSign}><Text style={{ color: accent }}>{t('Tap to Sign')}</Text></TouchableOpacity>}
            <Text style={styles.muted}>{request.grant.policyDay} · {openedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
            <Text style={styles.nameLabel}>{t('Legal name')}</Text><TextInput ref={nameRef} onFocus={() => keyboard.focus(nameRef.current)}
              accessibilityLabel={t('Legal name')} style={styles.input} autoCapitalize="words" value={draft.printedName}
              onChangeText={printedName => change({ ...draft, printedName })} />
          </View>
        </>}
        {!!(error || navigationError) && <Text accessibilityRole="alert" style={styles.error}>{error || navigationError}</Text>}
      </ScrollView>
      <View style={[footer.bar, footer.row]}>
        <View style={footer.slot}><TouchableOpacity accessibilityRole="button" onPress={back} style={[footer.button, { borderColor: accent }]}><Text style={footer.text}>{t('Back')}</Text></TouchableOpacity></View>
        <View style={footer.slot}><TouchableOpacity accessibilityRole="button" disabled={busy || screen === 'review' && (!prepared || !allSteps)}
          accessibilityState={{ disabled: busy || screen === 'review' && (!prepared || !allSteps), busy }}
          onPress={screen === 'review' ? onSubmit : next} style={[footer.button, { borderColor: accent, opacity: screen === 'review' && (!prepared || !allSteps) ? 0.45 : 1 }]}>
          {busy && <ActivityIndicator size="small" color={accent} />}<Text style={footer.text}>{t(screen === 'review' ? busy ? 'Submitting…' : 'Submit JSA' : 'Next')}</Text>
        </TouchableOpacity></View>
        <View style={footer.slot}><MoreMenu placement="bottom" compact /></View>
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: 'transparent' }, content: { padding: 10, gap: 8 },
  card: { backgroundColor: colors.glassSurface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textDark, marginBottom: 4 },
  badge: { fontWeight: '700', marginBottom: 8 }, hazard: { paddingVertical: 10, gap: 8 }, body: { color: colors.textDark, fontSize: 14 }, bold: { fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }, checkLabel: { color: colors.textDark, fontSize: 14, flex: 1 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.textDark, backgroundColor: colors.inputSurface },
  notes: { textAlignVertical: 'top', minHeight: 48 }, signature: { height: 54, backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 4 },
  signatureImage: { width: '100%', height: 48, tintColor: '#000' }, signPrompt: { padding: 20, alignItems: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 8 },
  contact: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }, muted: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  nameLabel: { color: colors.textDark, marginTop: 6, marginBottom: 8, fontWeight: '600' }, error: { color: colors.error, paddingVertical: 12, fontSize: 15 },
});
