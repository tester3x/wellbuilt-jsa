import React from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";

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
  signedAt?: string;
  compact?: boolean;
  onAddLocation?:()=>void;
};

/**
 * Canonical top summary card for every downstream JSA screen
 * (Steps, PPE, Review/Submit, View Saved JSA).
 *
 * Renders:
 *   1. Driver Name
 *   2. Truck #
 *   3. Location and Activity column headers (once)
 *   4. Value row(s): location left, activity right
 *   5. Date
 */
export function JsaSummaryCard({ driverName, truckNumber, rows, date,signedAt,onAddLocation,compact=false }: Props) {
  const { t } = useLanguage();

  if (compact) return (
    <View style={[styles.card, { padding: 10 }]}>
      <Text style={styles.compactIdentity}>{driverName || "-"} · {t("Truck #")} {truckNumber || "-"} · {date || "-"}</Text>
      <View style={styles.pairRow}>
        <View style={styles.pairLeft}><Text style={styles.pairLabel}>{t("Location")}</Text></View>
        <View style={styles.pairRight}><Text style={styles.pairLabel}>{t("Activity")}</Text></View>
      </View>
      {rows.map((row, index) => <View key={index} style={styles.pairRow}>
        <View style={styles.pairLeft}><Text style={styles.pairValueLeft}>{row.name}</Text></View>
        <View style={styles.pairRight}><Text style={styles.pairValueRight}>{row.resolvedActivity}</Text></View>
      </View>)}
    </View>
  );

  return (
    <View style={styles.card}>
      <Row label={t("Driver Name")} value={driverName || "-"} />
      <View style={styles.separator} />
      <Row label={t("Truck #")} value={truckNumber || "-"} />
      <View style={styles.separator} />
      <View style={styles.locationActivitySection}>
        {onAddLocation&&<TouchableOpacity accessibilityLabel="Add location / activity" onPress={onAddLocation} style={{alignSelf:'flex-end',padding:8}}><Text style={{fontWeight:'700',color:'#99710c'}}>＋ Add location / activity</Text></TouchableOpacity>}
        <View style={styles.pairRow}>
          <View style={styles.pairLeft}><Text style={styles.pairLabel}>{t("Location")}</Text></View>
          <View style={styles.pairRight}><Text style={styles.pairLabel}>{t("Activity")}</Text></View>
        </View>
        {rows.length > 0 ? (
          rows.map((r, i) => (
            <View key={`r-${i}`} style={styles.pairRow}>
              <View style={styles.pairLeft}>
                <Text style={styles.pairValueLeft} numberOfLines={1}>
                  {r.name}
                </Text>
              </View>
              <View style={styles.pairRight}>
                <Text style={styles.pairValueRight} numberOfLines={1}>
                  {r.resolvedActivity}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.pairRow}>
            <View style={styles.pairLeft}>
              <Text style={styles.pairValueLeft}>-</Text>
            </View>
            <View style={styles.pairRight}>
              <Text style={styles.pairValueRight} />
            </View>
          </View>
        )}
      </View>
      <View style={styles.separator} />
      <Row label={t("Date")} value={date || "-"} />
      {!!signedAt && <Row label={t("Signed")} value={signedAt} />}
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
  compactIdentity: { color: colors.textMuted, fontSize: 12 },
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
  pairRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 5,
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
