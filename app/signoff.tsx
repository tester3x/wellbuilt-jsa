import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { SummaryCard } from "../components/jsa";
import { colors } from "../constants/colors";
import {
    COMPANY_CONTACTS,
    EMERGENCY_CONTACTS,
    PREPARED_FOR_WORK_ITEMS,
} from "../constants/jsaTemplate";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

type Params = {
  driverName?: string;
  truckNumber?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  wells?: string;
  otherInfo?: string;
  location?: string;
  task?: string;
  date?: string;
  ppeSelected?: string;
  locations?: string;
  locationAcks?: string;
};

export default function SignoffScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();
  const { emergencyContacts: themeEmergencyContacts, companyContacts: themeCompanyContacts, accent } = useTheme();

  // Use company config contacts if available, otherwise fall back to hardcoded defaults
  const emergencyContacts = themeEmergencyContacts.length > 0
    ? themeEmergencyContacts.map((c, i) => ({ id: `ec-${i}`, ...c }))
    : EMERGENCY_CONTACTS;
  const companyContacts = themeCompanyContacts.length > 0
    ? themeCompanyContacts.map((c, i) => ({ id: `cc-${i}`, ...c }))
    : COMPANY_CONTACTS;

  const [prepared, setPrepared] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const isLoadedRef = useRef(false);

  // Parse wells and locations passed from previous screen
  const wellsList = useMemo(() => {
    try {
      const parsed = params.wells ? JSON.parse(params.wells) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [params.wells]);

  const locations = useMemo(() => {
    try {
      const parsed = params.locations ? JSON.parse(params.locations) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [params.locations]);

  const locationAcks = useMemo(() => {
    try {
      const parsed = params.locationAcks ? JSON.parse(params.locationAcks) : {};
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore
    }
    return {};
  }, [params.locationAcks]);

  const summaryFields = useMemo(
    () => [
      { label: t("Driver Name"), value: params.driverName || "-" },
      { label: t("Truck #"), value: params.truckNumber || "-" },
      { label: t("Job/Activity"), value: params.jobActivityName || params.task || "-" },
      { label: t("Pusher"), value: params.pusher || "-" },
      {
        label: t("Wells"),
        value: wellsList.length > 0 ? wellsList.join(", ") : params.wellName || "-",
      },
      {
        label: t("Locations"),
        value: locations.length > 0 ? locations.join(", ") : params.location || "-",
      },
      { label: t("Date"), value: params.date || "-" },
      { label: t("Other Info"), value: params.otherInfo || "-" },
    ],
    [params.driverName, params.truckNumber, params.jobActivityName, params.pusher, params.wellName, wellsList, params.location, locations, params.date, params.otherInfo, params.task, t]
  );

  const togglePrepared = (id: string) => {
    setPrepared((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    const loadPrepared = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.prepared);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            setPrepared(parsed);
          }
        }
      } catch (error) {
        console.warn("Failed to load prepared toggles", error);
      } finally {
        isLoadedRef.current = true;
      }
    };
    loadPrepared();
  }, []);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEYS.prepared, JSON.stringify(prepared)).catch((error) =>
      console.warn("Failed to save prepared toggles", error)
    );
  }, [prepared]);

  const handleSubmit = () => {
    // Validation: Signature is required
    if (!signature.trim()) {
      Alert.alert(
        t("Signature Required") || "Signature Required",
        t("Signature is required before submitting."),
        [{ text: t("OK") || "OK" }]
      );
      return;
    }

    const saveAndGo = async () => {
      const payload = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        driverName: params.driverName ?? "",
        truckNumber: params.truckNumber ?? "",
        jobActivityName: params.jobActivityName ?? "",
        pusher: params.pusher ?? "",
        wellName: params.wellName ?? "",
        wells: wellsList,
        otherInfo: params.otherInfo ?? "",
        location: params.location ?? "",
        task: params.task ?? "",
        date: params.date ?? "",
        ppeSelected: params.ppeSelected ?? "",
        locations,
        locationAcks,
        prepared,
        notes,
        signature,
      };
      try {
        const existing = await AsyncStorage.getItem(STORAGE_KEYS.saves);
        const list = existing ? JSON.parse(existing) : [];
        const nextList = Array.isArray(list) ? [payload, ...list] : [payload];
        await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(nextList));
      } catch (error) {
        console.warn("Failed to save JSA", error);
      }

      router.push({
        pathname: "/completed",
        params: {
          driverName: params.driverName ?? "",
          truckNumber: params.truckNumber ?? "",
          jobActivityName: params.jobActivityName ?? "",
          pusher: params.pusher ?? "",
          wellName: params.wellName ?? "",
          wells: JSON.stringify(wellsList),
          otherInfo: params.otherInfo ?? "",
          location: params.location ?? "",
          task: params.task ?? "",
          date: params.date ?? "",
          ppeSelected: params.ppeSelected ?? "",
          locations: JSON.stringify(locations),
          locationAcks: JSON.stringify(locationAcks),
          prepared: JSON.stringify(prepared),
          notes,
          signature,
        },
      });
    };

    void saveAndGo();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Sign Off"),
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => router.replace("/")}>
                <Text style={styles.headerLink}>{t("Home")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/history")}>
                <Text style={styles.headerLink}>{t("History")}</Text>
              </TouchableOpacity>
            </View>
          ),
          headerBackTitle: t("PPE Checklist"),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {/* Summary */}
          <SummaryCard fields={summaryFields} />

        {/* Prepared checklist */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("I am prepared for work")}</Text>
          {PREPARED_FOR_WORK_ITEMS.map((item) => (
            <View key={item.id} style={styles.checkRow}>
                <Switch
                  value={!!prepared[item.id]}
                  onValueChange={() => togglePrepared(item.id)}
                  thumbColor={prepared[item.id] ? accent : "#f4f3f4"}
                  trackColor={{ false: colors.border, true: accent + '40' }}
                />
                <Text style={styles.checkLabel}>{t(item.label)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>{t("Emergency Contacts")}</Text>
            {emergencyContacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <Text style={styles.contactLabel}>{contact.label}</Text>
                <Text style={styles.contactPhone}>{contact.phone}</Text>
              </View>
            ))}
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>{t("Company Contacts")}</Text>
            {companyContacts.map((contact) => (
              <View key={contact.id} style={styles.contactRow}>
                <Text style={styles.contactLabel}>{contact.label}</Text>
                <Text style={styles.contactPhone}>{contact.phone}</Text>
              </View>
            ))}
          </View>

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Additional Notes")}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder={t("Enter any notes")}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Signature */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Signature (type your full name)")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Full name")}
              placeholderTextColor={colors.textMuted}
              value={signature}
              onChangeText={setSignature}
              returnKeyType="done"
            />
          </View>

        <TouchableOpacity style={[styles.submitButton, { backgroundColor: accent }]} onPress={handleSubmit}>
          <Text style={styles.submitText}>{t("Submit JSA")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
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
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  contactLabel: {
    color: colors.textDark,
    fontSize: 14,
    flex: 1,
  },
  contactPhone: {
    color: colors.textMuted,
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
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  checkLabel: {
    color: colors.textDark,
    fontSize: 14,
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: colors.card,
  },
  multiline: {
    textAlignVertical: "top",
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  headerLink: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 14,
    paddingHorizontal: 10,
  },
});
