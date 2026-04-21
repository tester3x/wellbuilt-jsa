import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { cardShadow, colors } from "../../constants/colors";
import { useLanguage } from "../../app/contexts/LanguageContext";
import type { LocationActivityRow } from "./locationActivity";

type Props = {
  driverName: string;
  truckNumber: string;
  /**
   * Pre-resolved rows. Each row is guaranteed to have `name` and
   * `resolvedActivity` populated by the caller via `buildLocationActivityRows`.
   * This component does NOT perform any fallback lookups — if a row's
   * resolvedActivity is empty, that's a data-layer bug, not a render bug.
   */
  rows: LocationActivityRow[];
  date: string;
};

/**
 * Canonical top summary card for every downstream JSA screen
 * (Steps, PPE, Review/Submit, View Saved JSA).
 *
 * Renders EXACTLY four rows:
 *   1. Driver Name
 *   2. Truck #
 *   3. Location & Activity  (each row.name + row.resolvedActivity inline)
 *   4. Date
 *
 * There is no Job/Activity row here — activity is row-level, baked at the
 * data layer before the component is called.
 */
export function JsaSummaryCard({ driverName, truckNumber, rows, date }: Props) {
  const { t } = useLanguage();

  return (
    <View style={styles.card}>
      <Row label={t("Driver Name")} value={driverName || "-"} />
      <View style={styles.separator} />
      <Row label={t("Truck #")} value={truckNumber || "-"} />
      <View style={styles.separator} />
      <View style={styles.row}>
        <Text style={styles.label}>{t("Location & Activity")}</Text>
        <View style={styles.valueContainer}>
          {rows.length > 0 ? (
            rows.map((r, i) => (
              <View key={`r-${i}`} style={styles.entryRow}>
                <Text style={styles.entryName} numberOfLines={1}>
                  {r.name}
                </Text>
                {/* Temporary debug format — brackets around activity so
                    field-test can visually confirm data is present. If
                    resolvedActivity is empty, the bracket pair renders empty
                    and that's a data-layer bug (logged via console.warn
                    inside buildLocationActivityRows). */}
                <Text style={styles.entryJob} numberOfLines={1}>
                  [{r.resolvedActivity}]
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.value}>-</Text>
          )}
        </View>
      </View>
      <View style={styles.separator} />
      <Row label={t("Date")} value={date || "-"} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
  },
  valueContainer: {
    flex: 1,
    marginLeft: 12,
    alignItems: "flex-end",
  },
  value: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  entryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 2,
    alignItems: "baseline",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  entryName: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
  },
  entryJob: {
    fontSize: 12,
    color: "#888",
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
});
