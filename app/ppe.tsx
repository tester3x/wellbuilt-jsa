import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { SummaryCard } from "../components/jsa";
import { colors } from "../constants/colors";
import { PPE_ITEMS, PpeItem } from "../constants/jsaTemplate";
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
  jsaType?: string;
  date?: string;
  locations?: string;
  locationAcks?: string;
};

export default function PpeScreen() {
  const {
    driverName = "",
    truckNumber = "",
    jobActivityName = "",
    pusher = "",
    wellName = "",
    wells = "[]",
    otherInfo = "",
    location = "",
    task = "",
    jsaType = "",
    date = "",
    locations = "[]",
    locationAcks = "{}",
  } = useLocalSearchParams<Params>();
  const resolvedTask = jsaType || task;
  const router = useRouter();
  const { t } = useLanguage();
  const { accent } = useTheme();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [otherItems, setOtherItems] = useState<string[]>([]); // List of added "other" PPE items
  const [otherInput, setOtherInput] = useState(""); // Current text input for adding new items
  const isLoadedRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const wellsList = useMemo(() => {
    try {
      const parsed = JSON.parse(wells);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [wells]);

  const locationsList = useMemo(() => {
    try {
      const parsed = JSON.parse(locations);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [locations]);

  useEffect(() => {
    const loadSelections = async () => {
      try {
        const [storedSelected, storedOther] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.ppeSelected),
          AsyncStorage.getItem(STORAGE_KEYS.ppeOther),
        ]);
        if (storedSelected) {
          const parsed = JSON.parse(storedSelected);
          if (parsed && typeof parsed === "object") {
            setSelected(parsed);
          }
        }
        if (storedOther) {
          try {
            const parsedOther = JSON.parse(storedOther);
            if (Array.isArray(parsedOther)) {
              setOtherItems(parsedOther);
            } else if (typeof parsedOther === "object") {
              // Migrate from old format (object with other1, other2, etc.)
              const items = Object.values(parsedOther).filter((v) => typeof v === "string" && v.trim());
              setOtherItems(items as string[]);
            }
          } catch {
            // ignore
          }
        }
      } catch (error) {
        console.warn("Failed to load PPE selections", error);
      } finally {
        isLoadedRef.current = true;
      }
    };

    loadSelections();
  }, []);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEYS.ppeSelected, JSON.stringify(selected)).catch((error) =>
      console.warn("Failed to save PPE selections", error)
    );
  }, [selected]);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEYS.ppeOther, JSON.stringify(otherItems)).catch((error) =>
      console.warn("Failed to save PPE other items", error)
    );
  }, [otherItems]);

  const addOtherItem = () => {
    const trimmed = otherInput.trim();
    if (trimmed && !otherItems.includes(trimmed)) {
      setOtherItems((prev) => [...prev, trimmed]);
      setOtherInput("");
    }
  };

  const removeOtherItem = (item: string) => {
    setOtherItems((prev) => prev.filter((i) => i !== item));
  };

  const summaryFields = useMemo(
    () => [
      { label: t("Driver Name"), value: driverName || "-" },
      { label: t("Truck #"), value: truckNumber || "-" },
      { label: t("Job/Activity"), value: jobActivityName || "-" },
      { label: t("Pusher"), value: pusher || "-" },
      {
        label: t("Wells"),
        value: wellsList.length > 0 ? wellsList.join(", ") : wellName || "-",
      },
      {
        label: t("Locations"),
        value: locationsList.length > 0 ? locationsList.join(", ") : location || "-",
      },
      { label: t("Date"), value: date || "-" },
      { label: t("Other Info"), value: otherInfo || "-" },
    ],
    [driverName, truckNumber, jobActivityName, pusher, wellName, wellsList, location, locationsList, date, otherInfo, t]
  );

  const toggleItem = (item: PpeItem) => {
    setSelected((prev) => ({
      ...prev,
      [item.id]: !prev[item.id],
    }));
  };

  const isChecked = (id: string) => !!selected[id];

  const handleNext = () => {
    router.push({
      pathname: "/signoff",
      params: {
        driverName,
        truckNumber,
        jobActivityName,
        pusher,
        wellName,
        wells: JSON.stringify(wellsList),
        otherInfo,
        location: locationsList[0] || location || "",
        locations: JSON.stringify(locationsList),
        locationAcks,
        task: jobActivityName || task || "",
        date,
        ppeSelected: JSON.stringify({ selected, otherItems }),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("PPE Checklist"),
          headerBackTitle: t("Steps & Hazards"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: accent, fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={Keyboard.dismiss}>
          {/* Summary */}
          <SummaryCard fields={summaryFields} />

        {/* Checklist */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("PPE Required")}</Text>
          <View style={styles.list}>
            {PPE_ITEMS.filter((item) => !item.id.toLowerCase().startsWith("other")).map((item) => {
              const checked = isChecked(item.id);
              return (
                <View key={item.id} style={styles.listRow}>
                  <TouchableOpacity
                    onPress={() => toggleItem(item)}
                    style={[styles.checkbox, { borderColor: accent }, checked && [styles.checkboxChecked, { backgroundColor: accent }]]}
                    activeOpacity={0.8}
                  >
                    {checked && <Text style={styles.checkboxMark}>✓</Text>}
                  </TouchableOpacity>
                  <Text style={styles.itemLabel}>{t(item.label)}</Text>
                </View>
              );
            })}

            {/* Other PPE input */}
            <View style={styles.listRow}>
              <View style={[styles.checkbox, styles.checkboxChecked, { borderColor: accent, backgroundColor: accent }]}>
                <Text style={styles.checkboxMark}>+</Text>
              </View>
              <Text style={styles.itemLabel}>{t("Other")}</Text>
              <TextInput
                style={styles.otherInput}
                placeholder={t("Type & press Done to add")}
                placeholderTextColor={colors.textMuted}
                value={otherInput}
                onChangeText={setOtherInput}
                onSubmitEditing={addOtherItem}
                onFocus={() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }}
                returnKeyType="done"
                blurOnSubmit={false}
              />
            </View>

            {/* List of added "other" items */}
            {otherItems.map((item) => (
              <View key={item} style={styles.listRow}>
                <View style={[styles.checkbox, styles.checkboxChecked, { borderColor: accent, backgroundColor: accent }]}>
                  <Text style={styles.checkboxMark}>✓</Text>
                </View>
                <Text style={styles.itemLabel}>{item}</Text>
                <TouchableOpacity onPress={() => removeOtherItem(item)} style={styles.removeButton}>
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>

          <TouchableOpacity style={[styles.nextButton, { backgroundColor: accent }]} onPress={handleNext}>
            <Text style={styles.nextButtonText}>{t("Next")}</Text>
          </TouchableOpacity>
          </Pressable>
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
    paddingBottom: 150,
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
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
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
    marginBottom: 10,
  },
  list: {
    gap: 10,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "800",
  },
  itemLabel: {
    color: colors.textDark,
    fontSize: 14,
    flex: 1,
  },
  otherInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textDark,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFE0E0",
    alignItems: "center",
    justifyContent: "center",
  },
  removeButtonText: {
    color: "#D32F2F",
    fontSize: 14,
    fontWeight: "700",
  },
  addOtherButton: {
    marginTop: 12,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#FFF7DF",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addOtherText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  nextButton: {
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
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
