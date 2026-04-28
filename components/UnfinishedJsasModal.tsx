// UnfinishedJsasModal — shown on app launch (and on foreground) when the driver
// has prior-day JSAs with wells stamped but never signed off. Driver must
// resume-and-sign or discard-with-reason. Compliance nag, not a soft reminder.

import React, { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../constants/colors';
import type { UnfinishedJsa } from '../services/jsaStatus';

interface Props {
  visible: boolean;
  list: UnfinishedJsa[];
  onResume: (date: string, wellNames: string[]) => void;
  onDiscard: (date: string, reason: string) => void;
  onClose: () => void;
}

const DISCARD_REASONS = [
  'Forgot to finish',
  'JSA no longer applicable',
  'Duplicate of another JSA',
  "Wells cancelled — didn't actually work",
  'Other',
];

function formatDate(d: string): string {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

export default function UnfinishedJsasModal({
  visible,
  list,
  onResume,
  onDiscard,
  onClose,
}: Props) {
  const [discardingDate, setDiscardingDate] = useState<string | null>(null);
  const [discardReason, setDiscardReason] = useState('');
  const [customReason, setCustomReason] = useState('');

  const resetDiscard = () => {
    setDiscardingDate(null);
    setDiscardReason('');
    setCustomReason('');
  };

  const handleDiscardConfirm = () => {
    if (!discardingDate) return;
    const finalReason =
      discardReason === 'Other' ? customReason.trim() : discardReason;
    if (!finalReason || finalReason.length < 3) {
      Alert.alert(
        'Reason required',
        'Please select a reason or describe in at least 3 characters.',
      );
      return;
    }
    onDiscard(discardingDate, finalReason);
    resetDiscard();
  };

  // Discard-reason prompt takes over the modal when active
  if (discardingDate) {
    return (
      <Modal visible transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.box}>
            <Text style={styles.title}>
              Discard JSA for {formatDate(discardingDate)}?
            </Text>
            <Text style={styles.subtitle}>
              Required: audit reason. This is logged and visible to your
              company's safety manager.
            </Text>
            {DISCARD_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.reasonRow,
                  discardReason === r && styles.reasonRowActive,
                ]}
                onPress={() => setDiscardReason(r)}
              >
                <Text
                  style={[
                    styles.reasonText,
                    discardReason === r && { color: '#000', fontWeight: '700' },
                  ]}
                >
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
            {discardReason === 'Other' && (
              <TextInput
                style={styles.input}
                placeholder="Describe reason..."
                placeholderTextColor="#888"
                value={customReason}
                onChangeText={setCustomReason}
                multiline
              />
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetDiscard}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleDiscardConfirm}
              >
                <Text style={styles.confirmText}>Confirm Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>
            Unfinished JSA{list.length === 1 ? '' : 's'} ({list.length})
          </Text>
          <Text style={styles.subtitle}>
            These JSAs have wells you visited but never signed off. Resume and
            finish, or discard with a reason for the audit trail.
          </Text>
          <ScrollView style={styles.list}>
            {list.map(j => (
              <View key={j.date} style={styles.item}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemDate}>{formatDate(j.date)}</Text>
                  <Text style={styles.itemWells}>
                    {j.wellCount} well{j.wellCount === 1 ? '' : 's'}:{' '}
                    {j.wellNames.slice(0, 3).join(', ')}
                    {j.wellNames.length > 3 ? '…' : ''}
                  </Text>
                </View>
                <View style={styles.btnCol}>
                  {/* Path C (4/28): Resume button removed. The previous Resume
                      flow only restored date + wellNames into a fresh form —
                      no signature, no PPE, no acknowledgments — which opened
                      what looked like a blank screen and misled the driver
                      into thinking they could "continue" a JSA that was never
                      actually saved with full state. Discard-with-reason is
                      the correct compliance path. The signed JSA history
                      remains accessible via the History screen.
                      onResume prop kept for type compatibility but unused. */}
                  <TouchableOpacity
                    style={styles.discardBtn}
                    onPress={() => setDiscardingDate(j.date)}
                  >
                    <Text style={styles.discardText}>Discard</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Remind me later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  box: {
    backgroundColor: colors.background,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    maxHeight: '85%',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textDark,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 14,
    lineHeight: 18,
  },
  list: {
    maxHeight: 400,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#fff5e6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fbbf24',
    marginBottom: 10,
  },
  itemDate: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textDark,
    marginBottom: 2,
  },
  itemWells: {
    fontSize: 12,
    color: colors.textMuted,
  },
  btnCol: {
    flexDirection: 'column',
    gap: 6,
    marginLeft: 8,
  },
  resumeBtn: {
    backgroundColor: '#10b981',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  resumeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  discardBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  discardText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  reasonRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reasonRowActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reasonText: {
    fontSize: 14,
    color: colors.textDark,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    color: colors.textDark,
    fontSize: 14,
    marginBottom: 10,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#dc2626',
  },
  confirmText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
