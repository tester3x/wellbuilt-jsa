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
   * resolvedActivity is empty, the Activity cell stays empty.
   */
  rows: LocationActivityRow[];
  date: string;
};

/**
 * Canonical top summary card for every downstream JSA screen
 * (Steps, PPE, Review/Submit, View Saved JSA).
 *
 * Renders:
 *   1. Driver Name
 *   2. Truck #
 *   3. Location & Activity title on its own full-width row
 *   4. Value row(s): location left, activity right
 *   5. Date
 */
export function JsaSummaryCard({ driverName, truckNumber, rows, date }: Props) {
  const { t } = useLanguage();

  return (
    <View style={styles.card}>
      <Row label={t("Driver Name")} value={driverName || "-"} />
      <View style={styles.separator} />
      <Row label={t("Truck #")} value={truckNumber || "-"} />
      <View style={styles.separator} />
      <View style={styles.locationActivitySection}>
        <Text style={styles.sectionTitle}>{t("Location & Activity")}</Text>
        {rows.length > 0 ? (
          rows.map((r, i) => (
            <View key={`r-${i}`} style={styles.pairRow}>
              <View style={styles.pairLeft}>
                <Text style={styles.pairLabel}>{t("Location")}</Text>
                <Text style={styles.pairValueLeft}>
                  {r.name}
                </Text>
              </View>
              <View style={styles.pairRight}>
                <Text style={styles.pairLabel}>{t("Activity")}</Text>
                <Text style={styles.pairValueRight}>
                  {r.resolvedActivity}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.pairRow}>
            <View style={styles.pairLeft}>
              <Text style={styles.pairLabel}>{t("Location")}</Text>
              <Text style={styles.pairValueLeft}>-</Text>
            </View>
            <View style={styles.pairRight}>
              <Text style={styles.pairLabel}>{t("Activity")}</Text>
              <Text style={styles.pairValueRight} />
            </View>
          </View>
        )}
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
  value: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    flex: 1,
    marginLeft: 12,
  },
  locationActivitySection: {
    paddingVertical: 4,
  },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: 13,
    alignSelf: "stretch",
    marginBottom: 6,
  },
  pairRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "flex-start",
    gap: 12,
  },
  pairLeft: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "flex-start",
  },
  pairRight: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    alignItems: "flex-end",
  },
  pairLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  pairValueLeft: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "left",
    alignSelf: "stretch",
    flexShrink: 1,
  },
  pairValueRight: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
    alignSelf: "stretch",
    flexShrink: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
});
