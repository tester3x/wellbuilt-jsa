/**
 * Fail-closed / already-completed surface for a governed request.
 * Success return uses status-only jsa-return. Failures relaunch via WB-T.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import { decideGovernedReturn } from '../services/sso/jsaReturn';
import { consumeGovernedLaunchAfterStay, loadLaunchContext } from '../services/sso/jsaRuntime';
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

type Params = {
  mode?: string;
  refusal?: string;
  action?: string;
  reused?: string;
};

export default function GovernedStatusScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
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
    await consumeGovernedLaunchAfterStay();
    router.replace('/(tabs)');
  };

  const onReturn = async () => {
    if (mode === 'fail' && stayAndRetry) {
      await onRetry();
      return;
    }
    if ((mode === 'completed' || mode === 'submitted') && action) {
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
      <View style={styles.card}>
        <Text style={styles.title}>
          {mode === 'submitted' ? submittedHeading()
            : mode === 'completed' ? replayHeading()
              : 'Cannot continue'}
        </Text>
        <Text style={styles.copy}>{copy}</Text>
        {mode === 'submitted' && action ? (
          <Text style={styles.meta}>{governedCombinedTerminalCopy(action)}</Text>
        ) : null}
        {mode === 'completed' && action ? (
          <Text style={styles.meta}>{governedCombinedTerminalCopy(action)}</Text>
        ) : null}
        {mode === 'submitted' ? (
          <TouchableOpacity
            style={[styles.btn, styles.secondaryBtn]}
            onPress={onStayOnJsa}
            accessibilityLabel="Stay on JSA"
          >
            <Text style={styles.secondaryBtnText}>Stay on JSA</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.btn}
          onPress={onReturn}
          accessibilityLabel={stayAndRetry && mode === 'fail' ? 'Retry' : 'Return to WellBuilt Tickets'}
        >
          <Text style={styles.btnText}>
            {stayAndRetry && mode === 'fail' ? 'Retry' : 'Return to WellBuilt Tickets'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.card,
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
