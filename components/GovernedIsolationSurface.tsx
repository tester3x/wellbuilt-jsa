import React from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import ShiftAuthorityGate from './ShiftAuthorityGate';
import {
  GOVERNED_CONNECTING_COPY,
  GOVERNED_FAILED_COPY,
  type IsolationSurfaceKind,
} from '../services/sso/jsaJobDetailsIsolation';
import type { GovernedReturnTarget } from '../services/shiftAuthority';

export default function GovernedIsolationSurface({
  kind,
  returnTarget = 'wbt',
  variant = 'card',
}: {
  kind: IsolationSurfaceKind | null;
  returnTarget?: GovernedReturnTarget | null;
  variant?: 'card' | 'overlay';
}) {
  if (kind === 'unverified_gate') {
    return <ShiftAuthorityGate variant={variant} returnTarget={returnTarget} />;
  }
  const onReturn = () => {
    const url = returnTarget === 'wbt' ? 'wellbuilt-tickets://resume' : 'wellbuilt-suite://';
    Linking.openURL(url).catch(() => {});
  };
  const wrapStyle = variant === 'overlay' ? styles.overlay : styles.card;
  if (kind === 'governed_failed') {
    return (
      <View style={wrapStyle}>
        <Text style={styles.title}>Cannot continue</Text>
        <Text style={styles.copy}>{GOVERNED_FAILED_COPY}</Text>
        <TouchableOpacity style={styles.btn} onPress={onReturn} accessibilityLabel="Return to WellBuilt">
          <Text style={styles.btnText}>Return to WellBuilt</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={wrapStyle}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.copy}>{GOVERNED_CONNECTING_COPY}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
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
    marginBottom: 16,
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
    textAlign: 'center',
    marginTop: 12,
  },
  btn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnText: {
    color: colors.textDark,
    fontWeight: '700',
    fontSize: 16,
  },
});
