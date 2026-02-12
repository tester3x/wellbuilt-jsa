import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { PrimaryButton, SummaryCard } from "../components/jsa";
import { colors } from "../constants/colors";
import { useLanguage } from "./contexts/LanguageContext";

type Params = {
  driverName?: string;
  truckNumber?: string;
  location?: string;
  locations?: string;
  wells?: string;
  locationAcks?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  otherInfo?: string;
  task?: string;
  jsaType?: string;
  date?: string;
  ppeSelected?: string;
  prepared?: string;
  notes?: string;
  signature?: string;
};

export default function CompletedScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();

  const summaryFields = useMemo(
    () => [
      { label: t("Driver Name"), value: params.driverName || "-" },
      { label: t("Truck #"), value: params.truckNumber || "-" },
      { label: t("Job/Activity"), value: params.jobActivityName || "-" },
      { label: t("Pusher"), value: params.pusher || "-" },
      {
        label: t("Wells"),
        value: (() => {
          try {
            const parsed = params.wells ? JSON.parse(params.wells as string) : [];
            if (Array.isArray(parsed) && parsed.length) return parsed.join(", ");
          } catch {
            // ignore
          }
          return params.wellName || "-";
        })(),
      },
      { label: t("Date"), value: params.date || "-" },
      {
        label: t("Locations"),
        value: (() => {
          try {
            const parsed = params.locations ? JSON.parse(params.locations as string) : [];
            if (Array.isArray(parsed) && parsed.length) return parsed.join(", ");
          } catch {
            // ignore
          }
          return params.location || "-";
        })(),
      },
      { label: t("Task"), value: params.jsaType || params.task || "-" },
      { label: t("Other Info"), value: params.otherInfo || "-" },
    ],
    [
      params.driverName,
      params.truckNumber,
      params.jobActivityName,
      params.pusher,
      params.wellName,
      params.wells,
      params.date,
      params.locations,
      params.location,
      params.jsaType,
      params.task,
      params.otherInfo,
      t,
    ]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Completed"),
          headerBackTitle: t("Sign Off"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t("JSA Completed")}</Text>

        <SummaryCard fields={summaryFields} />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("Signature")}</Text>
          <Text style={styles.signatureText}>{params.signature || "—"}</Text>
        </View>

        {!!params.notes && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Notes")}</Text>
            <Text style={styles.notesText}>{params.notes}</Text>
          </View>
        )}

        <PrimaryButton
          title={t("Add another location")}
          variant="secondary"
          onPress={() => {
            router.push({
              pathname: "/signoff",
              params: {
                driverName: params.driverName,
                truckNumber: params.truckNumber,
                jobActivityName: params.jobActivityName,
                pusher: params.pusher,
                wellName: params.wellName,
                otherInfo: params.otherInfo,
                location: params.location,
                task: params.task,
                date: params.date,
                ppeSelected: params.ppeSelected,
                locations: params.locations,
                locationAcks: params.locationAcks,
              },
            });
          }}
          style={{ marginTop: 8 }}
        />

        <PrimaryButton
          title={t("Done")}
          onPress={() => router.push("/")}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textDark,
    textAlign: "center",
    marginBottom: 8,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  summaryValue: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 6,
  },
  signatureText: {
    color: colors.textDark,
    fontSize: 15,
    fontWeight: "600",
  },
  notesText: {
    color: colors.textDark,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  secondaryButtonText: {
    color: colors.primaryDark,
  },
  logo: {
    width: 64,
    height: 64,
    marginBottom: 8,
    alignSelf: "flex-start",
  },
});
