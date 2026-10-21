/**
 * Fail-closed / already-completed surface for a governed request.
 * Success return uses status-only jsa-return. Failures relaunch via WB-T.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import JsaAppBackground from '../components/JsaAppBackground';
import { useTheme } from './contexts/ThemeContext';
import { decideGovernedReturn } from '../services/sso/jsaReturn';
import {
  consumeGovernedLaunchAfterStay,
  handoffGovernedReturnThenConsume,
  loadLaunchContext,
} from '../services/sso/jsaRuntime';
import {
  failClosedCopy,
  type JsaCompletionAction,
  type JsaRefusal,
} from '../services/sso/jsaRequestLifecycle';
import {
  governedCombinedTerminalCopy,
  replayHeading,
  submittedHeading,
} from '../services/sso/jsaGovernedTerminal';
import { useLanguage } from './contexts/LanguageContext';

type Params = {
  mode?: string;
  refusal?: string;
  action?: string;
  reused?: string;
};

export default function GovernedStatusScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();
  const { accent } = useTheme();
  const mode = params.mode === 'submitted'
    ? 'submitted'
    : params.mode === 'completed' ? 'completed' : 'fail';
  const refusal = (params.refusal || 'malformed') as JsaRefusal;
  const action = params.action as JsaCompletionAction | undefined;
  const stayAndRetry = refusal === 'complete_failed' || refusal === 'local_save_failed';
  const [copy, setCopy] = useState(
    mode === 'submitted'
      ? 'Your JSA has been submitted and saved.'
      : mode === 'completed'
        ? 'This JSA request is already completed. Return to WellBuilt Tickets.'
        : failClosedCopy(refusal),
  );
  const [archiveState, setArchiveState] = useState<'checking' | 'pending' | 'blocked' | 'clear'>(mode === 'completed' ? 'checking' : 'clear');
  const [retryingArchive, setRetryingArchive] = useState(false);
  const checkArchive = async () => {
    const launch = await loadLaunchContext();
    if (!launch) { setArchiveState('clear'); return; }
    const { pendingGovernedArtifact } = await import('../services/sso/jsaArtifactLive');
    const pending = await pendingGovernedArtifact(launch.requestId);
    setArchiveState(pending ? pending.artifactState === 'blocked' ? 'blocked' : 'pending' : 'clear');
  };
  useEffect(() => {
    if (mode !== 'completed') return;
    void checkArchive().catch(() => setArchiveState('pending'));
  }, [mode]);

  useEffect(() => {
    if (mode === 'submitted') {
      setCopy('Your JSA has been submitted and saved.');
      return;
    }
    if (mode === 'completed') {
      setCopy(
        params.reused === '1'
          ? 'This JSA request was already recorded. Return to WellBuilt Tickets.'
          : 'This JSA request is already completed. Return to WellBuilt Tickets.',
      );
    }
  }, [mode, params.reused]);

  const onRetry = async () => {
    const { recoverGoverned } = await import('../services/sso/jsaGovernedLive');
    const { liveGovernedDeps } = await import('../services/sso/jsaGovernedLive');
    const { resolveEntryRoute } = await import('../services/sso/jsaGovernedRoute');
    const decision = await recoverGoverned();
    const href = await resolveEntryRoute(decision, liveGovernedDeps());
    router.replace(href as any);
  };

  const onStayOnJsa = async () => {
    const launch = await loadLaunchContext();
    const returned = decideGovernedReturn({ launch, completion: launch && mode !== 'fail' && action
      ? { requestId: launch.requestId, action, reused: params.reused === '1' } : null });
    await (await import('../services/jsaStayReturn')).rememberJsaStay('open' in returned ? returned.open : null);
    await consumeGovernedLaunchAfterStay();
    router.replace('/(tabs)');
  };

  const onReturn = async () => {
    if (mode === 'completed' && archiveState !== 'clear') {
      if (archiveState === 'checking' || archiveState === 'blocked' || retryingArchive) return;
      setRetryingArchive(true);
      try {
        const launch = await loadLaunchContext();
        if (launch) await (await import('../services/sso/jsaArtifactLive')).retrySavedGovernedArtifact(launch.requestId);
        await checkArchive();
      } catch { setArchiveState('pending'); }
      finally { setRetryingArchive(false); }
      return;
    }
    if (mode === 'fail' && stayAndRetry) {
      await onRetry();
      return;
    }
    if (mode === 'submitted' && action) {
      const launch = await loadLaunchContext();
      const result = await handoffGovernedReturnThenConsume({
        launch,
        action,
        reused: params.reused === '1',
        openUrl: (url) => Linking.openURL(url),
      });
      if (result === 'opened_and_consumed') return;
      if (result === 'open_failed_retain') return;
      return;
    }
    if (mode === 'completed' && action) {
      const launch = await loadLaunchContext();
      const decided = decideGovernedReturn({
        launch,
        completion: launch
          ? { requestId: launch.requestId, action, reused: params.reused === '1' }
          : null,
      });
      if ('open' in decided) {
        try { await Linking.openURL(decided.open); } catch {}
        return;
      }
    }
    try { await Linking.openURL('wellbuilt-tickets://resume'); } catch {}
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.wrap}>
      <JsaAppBackground />
      <View style={styles.card}>
        <Text style={styles.title}>
          {t(mode === 'completed' && archiveState !== 'clear' ? archiveState === 'blocked' ? 'Saved copy needs assistance' : 'Signed copy still syncing' : mode === 'submitted' ? submittedHeading()
            : mode === 'completed' ? replayHeading()
              : 'Cannot continue')}
        </Text>
        <Text style={styles.copy}>{t(mode === 'completed' && archiveState !== 'clear'
          ? archiveState === 'blocked' ? 'Your JSA completion is recorded, but its signed copy needs assistance. Your saved JSA is retained; do not read or sign a replacement.'
            : 'Your JSA completion is recorded. Its signed copy is saved on this device and is still syncing. Retry the saved copy; you do not need to read or sign it again.'
          : copy)}</Text>
        {mode === 'submitted' && action ? (
          <Text style={styles.meta}>{t(governedCombinedTerminalCopy(action))}</Text>
        ) : null}
        {mode === 'completed' && action ? (
          <Text style={styles.meta}>{t(governedCombinedTerminalCopy(action))}</Text>
        ) : null}
        {mode === 'submitted' ? (
          <TouchableOpacity
            style={[styles.btn, styles.secondaryBtn]}
            onPress={onStayOnJsa}
            accessibilityLabel={t('Stay on JSA')}
          >
            <Text style={styles.secondaryBtnText}>{t('Stay on JSA')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: accent }]}
          onPress={onReturn}
          disabled={retryingArchive || (mode === 'completed' && (archiveState === 'checking' || archiveState === 'blocked'))}
          accessibilityLabel={t(stayAndRetry && mode === 'fail' ? 'Retry' : 'Return to WellBuilt Tickets')}
        >
          <Text style={styles.btnText}>
            {t(mode === 'completed' && archiveState !== 'clear' ? retryingArchive || archiveState === 'checking' ? 'Checking saved copy…' : archiveState === 'blocked' ? 'Office assistance needed' : 'Retry saved copy' : stayAndRetry && mode === 'fail' ? 'Retry' : 'Return to WellBuilt Tickets')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.glassSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textDark,
    marginBottom: 10,
    textAlign: 'center',
  },
  copy: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 18,
  },
  meta: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  btn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryBtnText: {
    color: colors.textDark,
    fontWeight: '700',
    fontSize: 16,
  },
});
