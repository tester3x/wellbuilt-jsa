import { StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

// Equal slots keep actions anchored as labels and read stages change.
export const jsaFlowFooterStyles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card,
    borderTopWidth: 1, borderTopColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 48, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.textDark, fontSize: 14, fontWeight: '700', textAlign: 'center' },
});
