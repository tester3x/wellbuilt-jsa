import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { colors } from "../constants/colors";
import { useLanguage } from "./contexts/LanguageContext";

type Params = {
  driverName?: string;
  truckNumber?: string;
  date?: string;
};

type SavedJsa = {
  id: string;
  timestamp: string;
  driverName: string;
  truckNumber: string;
  location: string;
  task: string;
  jsaType?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  otherInfo?: string;
  date: string;
  locations?: string[];
  locationAcks?: Record<string, string>;
  ppeSelected?: string;
  prepared?: Record<string, boolean>;
  notes?: string;
  signature?: string;
};

export default function OpenJsasScreen() {
  const { driverName = "", truckNumber = "", date = "" } = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();
  const [saves, setSaves] = useState<SavedJsa[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const stored = await AsyncStorage.getItem("@jsa/saves");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSaves(parsed);
          }
        }
      } catch (error) {
        console.warn("Failed to load JSAs", error);
      }
    };
    load();
  }, []);

  const today = useMemo(() => (date ? date : new Date().toISOString().slice(0, 10)), [date]);

  const todaysJsas = useMemo(
    () =>
      saves.filter(
        (item) =>
          (item.driverName || "").trim() === driverName.trim() &&
          (item.truckNumber || "").trim() === truckNumber.trim() &&
          item.date === today
      ),
    [saves, driverName, truckNumber, today]
  );

  const openJsa = (item: SavedJsa) => {
    router.push({
      pathname: "/signoff",
      params: {
        driverName: item.driverName,
        truckNumber: item.truckNumber,
        location: item.location,
        locations: JSON.stringify(item.locations ?? []),
        locationAcks: JSON.stringify(item.locationAcks ?? {}),
        task: item.jsaType || item.task,
        jsaType: item.jsaType || item.task,
        date: item.date,
        ppeSelected: item.ppeSelected ?? "",
        jobActivityName: item.jobActivityName || "",
        pusher: item.pusher || "",
        wellName: item.wellName || "",
        otherInfo: item.otherInfo || "",
        prepared: JSON.stringify(item.prepared ?? {}),
        notes: item.notes ?? "",
        signature: item.signature ?? "",
      },
    });
  };

  const renderCard = (item: SavedJsa) => (
    <TouchableOpacity key={item.id} style={styles.card} onPress={() => openJsa(item)}>
      <View style={styles.row}>
        <Text style={styles.label}>{t("Task")}</Text>
        <Text style={styles.value}>{item.jsaType || item.task || "-"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t("Location")}</Text>
        <Text style={styles.value}>{item.location || "-"}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>{t("Date")}</Text>
        <Text style={styles.value}>{item.date || "-"}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Today's JSAs"),
          headerBackTitle: t("Back"),
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
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t("Select a JSA to continue")}</Text>
        {todaysJsas.length === 0 && (
          <Text style={styles.muted}>{t("No JSAs saved for today for this driver/truck.")}</Text>
        )}
        {todaysJsas.map(renderCard)}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", color: colors.textDark },
  muted: { color: colors.textMuted, fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  label: { color: colors.textMuted, fontSize: 13 },
  value: { color: colors.textDark, fontSize: 14, fontWeight: "600" },
});
