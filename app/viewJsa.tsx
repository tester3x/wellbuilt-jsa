import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
    Alert,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { colors } from "../constants/colors";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

type Params = {
  id?: string;
  driverName?: string;
  truckNumber?: string;
  location?: string;
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
  savedAt?: string;
  timestamp?: string;
  locations?: string;
  locationAcks?: string;
  editMode?: string;
};

export default function ViewJsaScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();
  const { accent } = useTheme();

  // Edit mode state - start in edit mode if editMode param is passed
  const [isEditing, setIsEditing] = useState(params.editMode === "true");
  const [driverName, setDriverName] = useState(params.driverName || "");
  const [truckNumber, setTruckNumber] = useState(params.truckNumber || "");
  const [jobActivityName, setJobActivityName] = useState(params.jobActivityName || "");
  const [pusher, setPusher] = useState(params.pusher || "");
  const [wellName, setWellName] = useState(params.wellName || "");
  const [otherInfo, setOtherInfo] = useState(params.otherInfo || "");
  const [notes, setNotes] = useState(params.notes || "");
  const [signature, setSignature] = useState(params.signature || "");

  const ppeList = useMemo(() => {
    try {
      const parsed = params.ppeSelected ? JSON.parse(params.ppeSelected) : {};
      if (parsed && typeof parsed === "object" && parsed.selected) {
        return Object.entries(parsed.selected)
          .filter(([, v]) => v)
          .map(([k]) => k);
      }
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
    return [];
  }, [params.ppeSelected]);

  const preparedList = useMemo(() => {
    try {
      const parsed = params.prepared ? JSON.parse(params.prepared) : {};
      if (parsed && typeof parsed === "object") {
        return Object.entries(parsed)
          .filter(([, v]) => v)
          .map(([k]) => k);
      }
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
    return [];
  }, [params.prepared]);

  const locationsList = useMemo(() => {
    try {
      const parsed = params.locations ? JSON.parse(params.locations) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
    return [];
  }, [params.locations]);
  const allLocationsText =
    locationsList.length > 0 ? locationsList.join(", ") : params.location || "-";

  const locationAcks = useMemo(() => {
    try {
      const parsed = params.locationAcks ? JSON.parse(params.locationAcks) : {};
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      return {};
    }
    return {};
  }, [params.locationAcks]);

  const handleSave = async () => {
    try {
      const existing = await AsyncStorage.getItem(STORAGE_KEYS.saves);
      const list = existing ? JSON.parse(existing) : [];
      if (!Array.isArray(list)) return;

      // Find and update the JSA by id or timestamp
      const updatedList = list.map((jsa: any) => {
        if (jsa.id === params.id || jsa.timestamp === params.timestamp || jsa.timestamp === params.savedAt) {
          return {
            ...jsa,
            driverName,
            truckNumber,
            jobActivityName,
            pusher,
            wellName,
            otherInfo,
            notes,
            signature,
          };
        }
        return jsa;
      });

      await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(updatedList));
      setIsEditing(false);
      Alert.alert(t("Saved"), t("JSA has been updated."));
    } catch (error) {
      console.warn("Failed to save JSA", error);
      Alert.alert(t("Error"), t("Failed to save changes."));
    }
  };

  const handleCancel = () => {
    // Reset to original values
    setDriverName(params.driverName || "");
    setTruckNumber(params.truckNumber || "");
    setJobActivityName(params.jobActivityName || "");
    setPusher(params.pusher || "");
    setWellName(params.wellName || "");
    setOtherInfo(params.otherInfo || "");
    setNotes(params.notes || "");
    setSignature(params.signature || "");
    setIsEditing(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: isEditing ? t("Edit JSA") : t("JSA Details"),
          headerBackTitle: t("Saved JSAs"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: accent, fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>{t("Job Details")}</Text>
          {isEditing ? (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Driver")}</Text>
                <TextInput
                  style={styles.input}
                  value={driverName}
                  onChangeText={setDriverName}
                  placeholder={t("Driver name")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Truck #")}</Text>
                <TextInput
                  style={styles.input}
                  value={truckNumber}
                  onChangeText={setTruckNumber}
                  placeholder={t("Truck number")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Job/Activity")}</Text>
                <TextInput
                  style={styles.input}
                  value={jobActivityName}
                  onChangeText={setJobActivityName}
                  placeholder={t("Job or activity")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Pusher")}</Text>
                <TextInput
                  style={styles.input}
                  value={pusher}
                  onChangeText={setPusher}
                  placeholder={t("Pusher name")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Well")}</Text>
                <TextInput
                  style={styles.input}
                  value={wellName}
                  onChangeText={setWellName}
                  placeholder={t("Well name")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Locations")}</Text>
                <Text style={styles.value}>{allLocationsText}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Task")}</Text>
                <Text style={styles.value}>{params.jsaType || params.task || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Date")}</Text>
                <Text style={styles.value}>{params.date || "-"}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Other Info")}</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={otherInfo}
                  onChangeText={setOtherInfo}
                  placeholder={t("Other information")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Driver")}</Text>
                <Text style={styles.value}>{driverName || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Truck #")}</Text>
                <Text style={styles.value}>{truckNumber || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Job/Activity")}</Text>
                <Text style={styles.value}>{jobActivityName || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Pusher")}</Text>
                <Text style={styles.value}>{pusher || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Well")}</Text>
                <Text style={styles.value}>{wellName || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Locations")}</Text>
                <Text style={styles.value}>{allLocationsText}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Task")}</Text>
                <Text style={styles.value}>{params.jsaType || params.task || "-"}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>{t("Date")}</Text>
                <Text style={styles.value}>{params.date || "-"}</Text>
              </View>
              {otherInfo ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t("Other Info")}</Text>
                  <Text style={styles.value}>{otherInfo}</Text>
                </View>
              ) : null}
              {(params.timestamp || params.savedAt) && (
                <View style={styles.row}>
                  <Text style={styles.label}>{t("Saved")}</Text>
                  <Text style={styles.value}>{new Date(params.timestamp || params.savedAt || "").toLocaleString()}</Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("Locations")}</Text>
          {locationsList.length ? (
            <View style={styles.list}>
              {locationsList.map((loc) => (
                <View key={loc} style={styles.listRow}>
                  <Text style={styles.listItem}>• {loc}</Text>
                  {locationAcks[loc] && (
                    <Text style={styles.mutedSmall}>{t("Ack")}: {new Date(locationAcks[loc]).toLocaleString()}</Text>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{t("No locations recorded.")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("PPE Selected")}</Text>
          {ppeList.length ? (
            <View style={styles.list}>
              {ppeList.map((item) => (
                <Text key={item} style={styles.listItem}>
                  • {t(item)}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{t("No PPE recorded.")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("Prepared for Work")}</Text>
          {preparedList.length ? (
            <View style={styles.list}>
              {preparedList.map((item) => (
                <Text key={item} style={styles.listItem}>
                  • {t(item)}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.muted}>{t("No checklist responses recorded.")}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("Notes")}</Text>
          {isEditing ? (
            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              placeholder={t("Enter notes")}
              placeholderTextColor={colors.textMuted}
              multiline
            />
          ) : (
            <Text style={styles.value}>{notes || "—"}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("Signature")}</Text>
          {isEditing ? (
            <TextInput
              style={styles.input}
              value={signature}
              onChangeText={setSignature}
              placeholder={t("Full name")}
              placeholderTextColor={colors.textMuted}
            />
          ) : (
            <Text style={styles.value}>{signature || "—"}</Text>
          )}
        </View>

        {isEditing && (
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
              <Text style={styles.cancelButtonText}>{t("Cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: accent }]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>{t("Save Changes")}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
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
  fieldRow: {
    marginBottom: 12,
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 4,
  },
  value: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
    textAlign: "right",
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: colors.card,
  },
  multiline: {
    textAlignVertical: "top",
    minHeight: 80,
  },
  list: {
    gap: 4,
  },
  listItem: {
    fontSize: 14,
    color: colors.textDark,
  },
  listRow: {
    marginBottom: 6,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  mutedSmall: {
    color: colors.textMuted,
    fontSize: 11,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: colors.textDark,
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
