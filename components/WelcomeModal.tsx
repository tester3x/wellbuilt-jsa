// WelcomeModal — greeting for an authenticated app entry or required read request.
// Continue opens job details for standalone entry, or the supplied job's reading.
// Suppressed when unfinished-JSA modal is showing — compliance nag takes priority.

import React from 'react';
import {
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../constants/colors';

interface Props {
  visible: boolean;
  driverFirstName: string;
  onDismiss: () => void;
  nextStep?: 'read' | 'details';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function todayLong(): string {
  try {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export default function WelcomeModal({
  visible,
  driverFirstName,
  onDismiss,
  nextStep = 'details',
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Image
            source={require('../assets/images/wb-jsa.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.greeting}>
            {greeting()}
            {driverFirstName ? `, ${driverFirstName}` : ''}
          </Text>
          <Text style={styles.subtitle}>Welcome to WellBuilt JSA</Text>
          <Text style={styles.date}>{todayLong()}</Text>
          <Text style={[styles.subtitle, { textAlign: 'center', marginBottom: 16 }]}>
            {nextStep === 'read' ? 'Your job details are ready. Continue to read your JSA.' : 'Add your job and locations, then read your JSA.'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 20,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  date: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 28,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  btnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
});
