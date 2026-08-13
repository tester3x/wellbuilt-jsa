/**
 * Acknowledgment-only governed UI. No steps/PPE.
 * Signature default is legalName only. Completes with `acknowledged`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureModal from '../components/SignatureModal';
import { colors } from '../constants/colors';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { completeGovernedAfterLocalSave } from '../services/sso/jsaGovernedLive';
import { decideGovernedReturn } from '../services/sso/jsaReturn';
import {
  failClosedCopy,
  governedRecordLink,
  pendingDisplayFields,
} from '../services/sso/jsaRequestLifecycle';
import { loadGovernedSession, loadLaunchContext, loadRequestContext } from '../services/sso/jsaRuntime';
import { legalAcknowledgmentName } from '../services/sso/jsaSession';
import { useTheme } from './contexts/ThemeContext';

export default function AcknowledgeScreen() {
  const router = useRouter();
  const { accent } = useTheme();
  const [jobRef, setJobRef] = useState('');
  const [groupRef, setGroupRef] = useState<string | null>(null);
  const [legalName, setLegalName] = useState('');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [showSig, setShowSig] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryCopy, setRetryCopy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const ctx = await loadRequestContext();
      if (ctx) {
        const fields = pendingDisplayFields(ctx);
        setJobRef(fields.jobRef);
        setGroupRef(fields.groupRef);
      }
      const session = await loadGovernedSession();
      setLegalName(legalAcknowledgmentName(session));
    })();
  }, []);

  const persistAndComplete = async () => {
    const ctx = await loadRequestContext();
    const launch = await loadLaunchContext();
    if (!ctx || ctx.intent !== 'acknowledge') {
      router.replace({ pathname: '/governed-status', params: { mode: 'fail', refusal: 'malformed' } } as any);
      return;
    }
    const localRecordId = `ack-${Date.now()}`;
    const payload = {
      id: localRecordId,
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
      signature: legalName,
      signatureImage: signatureImage || '',
      notes: '',
      wells: [],
      locations: [],
      ...governedRecordLink(ctx.requestId),
    };
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.saves);
      const list = existing ? JSON.parse(existing) : [];
      const nextList = Array.isArray(list) ? [payload, ...list] : [payload];
      await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(nextList));
    } catch {
      Alert.alert('Not saved', failClosedCopy('local_save_failed'));
      return;
    }
    const done = await completeGovernedAfterLocalSave({
      requestId: ctx.requestId,
      action: 'acknowledged',
      localRecordId,
    });
    if (done.kind === 'pending_retry') {
      setRetryCopy(done.copy);
      return;
    }
    if (done.kind === 'fail_closed') {
      router.replace({ pathname: '/governed-status', params: { mode: 'fail', refusal: done.refusal } } as any);
      return;
    }
    const ret = decideGovernedReturn({
      launch,
      completion: {
        requestId: ctx.requestId,
        action: done.action,
        reused: done.reused,
      },
    });
    if ('open' in ret) {
      try { await Linking.openURL(ret.open); } catch {}
      return;
    }
    router.replace({
      pathname: '/governed-status',
      params: { mode: 'completed', action: done.action, reused: done.reused ? '1' : '0' },
    } as any);
  };

  const onSubmit = () => {
    if (!signatureImage) {
      Alert.alert('Signature required', 'Please sign to acknowledge this JSA.');
      return;
    }
    setBusy(true);
    persistAndComplete().finally(() => setBusy(false));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Acknowledge JSA' }} />
      <View style={styles.body}>
        <Text style={styles.title}>Acknowledge this JSA</Text>
        <Text style={styles.meta}>Job {jobRef}{groupRef ? ` · ${groupRef}` : ''}</Text>
        <Text style={styles.label}>Legal name</Text>
        <TextInput
          style={styles.input}
          value={legalName}
          onChangeText={setLegalName}
          placeholder="Legal name"
          autoCapitalize="words"
        />
        <TouchableOpacity style={[styles.sigBtn, { borderColor: accent }]} onPress={() => setShowSig(true)}>
          <Text style={{ color: accent, fontWeight: '700' }}>
            {signatureImage ? 'Signature captured' : 'Add signature'}
          </Text>
        </TouchableOpacity>
        {retryCopy ? <Text style={styles.retry}>{retryCopy}</Text> : null}
        <TouchableOpacity
          style={[styles.submit, { backgroundColor: accent }]}
          onPress={onSubmit}
          disabled={busy}
        >
          <Text style={styles.submitText}>{retryCopy ? 'Retry' : 'Acknowledge'}</Text>
        </TouchableOpacity>
      </View>
      <SignatureModal
        visible={showSig}
        onClose={() => setShowSig(false)}
        onSave={setSignatureImage}
        accent={accent}
        title="Acknowledge"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textDark },
  meta: { fontSize: 14, color: colors.textMuted, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.textDark,
    backgroundColor: colors.card,
  },
  sigBtn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  retry: { color: '#b45309', fontSize: 14, lineHeight: 20 },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
