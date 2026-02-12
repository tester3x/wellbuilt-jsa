import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { cardShadow, colors } from "../../constants/colors";
import { SummaryField } from "../../types/jsa";

type SummaryCardProps = {
  fields: SummaryField[];
  title?: string;
};

export function SummaryCard({ fields, title }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.title}>{title}</Text>}
      {fields.map((field) => (
        <View key={field.label} style={styles.row}>
          <Text style={styles.label}>{field.label}</Text>
          <Text style={styles.value}>{field.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  value: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
});
