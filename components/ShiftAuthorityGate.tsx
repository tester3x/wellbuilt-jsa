// Fail-closed surface when the current WellBuilt shift cannot be verified.
// No name/passcode fields. Historical JSAs stay in the History tab.

import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import {
  SHIFT_UNVERIFIED_COPY,
  type GovernedReturnTarget,
} from '../services/shiftAuthority';

interface Props {
  variant?: 'overlay' | 'card';
  returnTarget?: GovernedReturnTarget | null;
}

function returnUrl(target: GovernedReturnTarget | null | undefined): string {
  return target === 'wbt' ? 'wellbuilt-tickets://resume' : 'wellbuilt-suite://';
}

export default function ShiftAuthorityGate({
  variant = 'overlay',
  returnTarget = 'suite',
}: Props) {
  const onReturn = () => {
    Linking.openURL(returnUrl(returnTarget)).catch(() => {});
  };

  const body = (
    <View style={variant === 'overlay' ? styles.card : styles.inlineCard}>
      <Text style={styles.title}>Shift not verified</Text>
      <Text style={styles.copy}>{SHIFT_UNVERIFIED_COPY}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={onReturn}
        accessibilityLabel="Return to WellBuilt"
      >
        <Text style={styles.btnText}>Return to WellBuilt</Text>
      </TouchableOpacity>
    </View>
  );

  if (variant === 'card') return body;
  return <View style={styles.overlay}>{body}</View>;
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
    maxWidth: 400,
  },
  inlineCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
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
    lineHeight: 22,
    marginBottom: 22,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
});
