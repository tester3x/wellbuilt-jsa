import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { cardShadow, colors } from "../../constants/colors";

export type SummaryFieldValue = string | number | React.ReactNode;

export type SummaryFieldLike = {
  label: string;
  value: SummaryFieldValue;
};

type SummaryCardProps = {
  fields: SummaryFieldLike[];
  title?: string;
};

function isScalar(v: SummaryFieldValue): v is string | number {
  return typeof v === "string" || typeof v === "number";
}

export function SummaryCard({ fields, title }: SummaryCardProps) {
  return (
    <View style={styles.card}>
      {title && <Text style={styles.title}>{title}</Text>}
      {fields.map((field) => (
        <View key={field.label} style={styles.row}>
          <Text style={styles.label}>{field.label}</Text>
          {isScalar(field.value) ? (
            <Text style={styles.value}>{field.value}</Text>
          ) : (
            <View style={styles.valueContainer}>{field.value}</View>
          )}
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
  valueContainer: {
    flex: 1,
    marginLeft: 12,
    alignItems: "flex-end",
  },
});
