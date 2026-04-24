import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
    Alert,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { JsaSummaryCard, buildLocationActivityRows } from "../components/jsa";
import { colors } from "../constants/colors";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { getDriverSession } from "../services/driverAuth";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

const PPE_LABELS: Record<string, string> = {
  safetyGlasses: "Safety Glasses",
  safetyShoes: "Safety Shoes",
  frClothing: "FR Clothing",
  hardHat: "Hard Hat",
  chemicalGloves: "Chemical/Impact Gloves",
  fourGasMonitor: "Four Gas Monitor",
  hearingProtection: "Hearing Protection",
  fallProtection: "Fall Protection",
  respirator: "Respirator",
  faceShield: "Face Shield",
  fireExtinguisher: "Fire Extinguisher",
};

const PREPARED_LABELS: Record<string, string> = {
  trained: "I am properly trained for the job",
  toolsAndPpe: "I have the tools and PPE needed for work",
  sds: "SDS",
  weatherChecked: "Weather conditions checked",
  emergencyPlan: "Emergency action plan reviewed",
};

type Params = {
  id?: string;
  driverName?: string;
  truckNumber?: string;
  location?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  wells?: string;
  otherInfo?: string;
  task?: string;
  jsaType?: string;
  date?: string;
  ppeSelected?: string;
  prepared?: string;
  notes?: string;
  signature?: string;
  signatureImage?: string;
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
  // Wells are serialized as object[] by signoff (`wells: wellsList` in
  // signoff.tsx — "full WellEntry[] objects now"). Older saves may contain
  // plain string[]. Type was `string[]` which lied about runtime shape.
  // SNAPSHOT ONLY — actual rendered list (wellsList) merges in
  // jsa_day_status.wells[] further down so the view reflects real work.
  const wellsListSnapshot: Array<string | { name?: string; jobType?: string; operator?: string; county?: string }> = useMemo(() => {
    try { return params.wells ? JSON.parse(params.wells) : []; } catch { return []; }
  }, [params.wells]);

  // Saves predating the activity-enforcement APK can have empty
  // form-level fields (jobActivityName, task) because old `handleWellSelect`
  // cleared jobActivityName after each add. In that shape, per-well jobType
  // was the only record of activity — form.jobActivityName = "", form.task = "".
  // When all form-level fields resolve empty, locationActivity.ts returns ""
  // and JsaSummaryCard renders the empty-bracket glyphs ("[]") the driver
  // saw in the field.
  //
  // This derives a single fallback activity from whichever well has a
  // non-empty jobType, and plugs it into form.jobActivityName when the
  // save's form-level field is empty. Per-row jobType still wins (resolver
  // priority unchanged); this only rescues the all-empty-form case.
  //
  // Data prep only — no changes to locationActivity.ts or JsaSummaryCard.
  const wellsSynthActivity = useMemo(() => {
    for (const w of wellsListSnapshot) {
      if (typeof w === 'string') continue;
      const j = w && typeof w.jobType === 'string' ? w.jobType : '';
      if (j.trim()) return j.trim();
    }
    return '';
  }, [wellsListSnapshot]);
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

  const locationsListFromParams = useMemo(() => {
    try {
      const parsed = params.locations ? JSON.parse(params.locations) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
    return [];
  }, [params.locations]);

  // ── Live JSA day truth ─────────────────────────────────────────────
  // The JSA is a LIVING document for the day, not a snapshot frozen at
  // signoff. WB T stamps every well + dropoff the driver actually visits
  // into jsa_day_status.wells[] (via FlowController.closeJob). Reading
  // params.wells alone shows only what was typed at signoff time — so a
  // dispatch reroute (e.g. driver typed "Gab 1" but actually worked
  // "Test Well") leaves the saved view stale.
  //
  // Fetch jsa_day_status keyed by {driverHash}_{params.date} and merge
  // its wells[] / locations[] into the displayed lists. Form-typed
  // entries take precedence (preserve operator/county/jobType metadata);
  // stamped-only entries fill in the missing names. Dedup by case-
  // insensitive trimmed name.
  const [stampedWells, setStampedWells] = useState<Array<{ name: string; type?: string; jobType?: string; stampedAt?: string }>>([]);
  const [stampedLocations, setStampedLocations] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await getDriverSession();
        const driverHash = session?.passcodeHash;
        const dateStr = typeof params.date === 'string' ? params.date : '';
        if (!driverHash || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
        const docId = `${driverHash}_${dateStr}`;
        const url = `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/jsa_day_status/${docId}?key=AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const doc = await resp.json();
        const f = doc.fields || {};
        // wells[] map array
        const wellsArr = (f.wells?.arrayValue?.values || [])
          .map((v: any) => {
            const fld = v?.mapValue?.fields;
            if (!fld) return null;
            return {
              name: fld.name?.stringValue || '',
              type: fld.type?.stringValue || '',
              jobType: fld.jobType?.stringValue || '',
              stampedAt: fld.stampedAt?.timestampValue || fld.stampedAt?.stringValue || '',
            };
          })
          .filter((w: any) => w && w.name);
        // locations[] is sometimes string[] (legacy) or map[] (newer signoff writes)
        const locsRaw = f.locations?.arrayValue?.values || [];
        const locs = locsRaw
          .map((v: any) => {
            if (typeof v?.stringValue === 'string') return v.stringValue;
            if (v?.mapValue?.fields?.name?.stringValue) return v.mapValue.fields.name.stringValue;
            return '';
          })
          .filter(Boolean);
        if (!cancelled) {
          setStampedWells(wellsArr);
          setStampedLocations(locs);
        }
      } catch (err) {
        if (__DEV__) console.warn('[JSA][viewJsa] jsa_day_status fetch failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [params.date]);

  // Merge form-snapshot wells with stamped wells. Form entries win on
  // metadata (operator/county/jobType). Stamped entries marked dropoff
  // get filtered to locationsList instead.
  const wellsList = useMemo(() => {
    const merged: Array<string | { name?: string; jobType?: string; operator?: string; county?: string }> = [...wellsListSnapshot];
    const seen = new Set(
      wellsListSnapshot
        .map((w: any) => (typeof w === 'string' ? w : w?.name || ''))
        .map((n: string) => n.trim().toUpperCase())
        .filter(Boolean),
    );
    for (const w of stampedWells) {
      // Dropoffs land in locationsList, not the wells row list
      if (w.type === 'dropoff') continue;
      const norm = w.name.trim().toUpperCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      merged.push({ name: w.name, jobType: w.jobType || '', operator: '', county: '' });
    }
    return merged;
  }, [wellsListSnapshot, stampedWells]);

  const locationsList = useMemo(() => {
    const merged: string[] = [...locationsListFromParams];
    const seen = new Set(merged.map((l) => l.trim().toUpperCase()).filter(Boolean));
    // Add manually-typed locations from jsa_day_status.locations[]
    for (const l of stampedLocations) {
      const norm = l.trim().toUpperCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      merged.push(l);
    }
    // Add any wells stamped as dropoff (SWDs, yards) — these are locations, not pickups
    for (const w of stampedWells) {
      if (w.type !== 'dropoff') continue;
      const norm = w.name.trim().toUpperCase();
      if (!norm || seen.has(norm)) continue;
      seen.add(norm);
      merged.push(w.name);
    }
    return merged;
  }, [locationsListFromParams, stampedLocations, stampedWells]);

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
          title: isEditing ? t("Edit JSA") : t("Job Safety Analysis"),
          headerBackTitle: t("Saved JSAs"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: '#fff', fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
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
        {isEditing ? (
        <View style={styles.card}>
          <Text style={styles.title}>{t("Job Details")}</Text>
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
                <Text style={styles.label}>{t("Well / Location")}</Text>
                <TextInput
                  style={styles.input}
                  value={wellName}
                  onChangeText={setWellName}
                  placeholder={t("Well or location name")}
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              {locationsList.length > 0 ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t("Locations")}</Text>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    {locationsList.map((l: string, i: number) => {
                      const locJob = jobActivityName || (params.task as string) || (params.jsaType as string) || '';
                      return (
                        <View key={`ed-l-${i}`} style={{ flexDirection: 'row', gap: 8, marginBottom: 2 }}>
                          <Text style={styles.value} numberOfLines={1}>{l}</Text>
                          {locJob ? (
                            <Text style={{ fontSize: 12, color: '#888' }}>{locJob}</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : (params.location ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t("Locations")}</Text>
                  <Text style={styles.value}>{params.location}</Text>
                </View>
              ) : null)}
              {(params.jsaType || params.task) ? (
                <View style={styles.row}>
                  <Text style={styles.label}>{t("Task")}</Text>
                  <Text style={styles.value}>{params.jsaType || params.task}</Text>
                </View>
              ) : null}
              <View style={styles.row}>
                <Text style={styles.label}>{t("Date")}</Text>
                <Text style={styles.value}>{params.date || "-"}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.label}>{t("Notes")}</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={otherInfo}
                  onChangeText={setOtherInfo}
                  placeholder={t("Notes")}
                  placeholderTextColor={colors.textMuted}
                  multiline
                />
              </View>
            </>
        </View>
        ) : (
          <>
            <JsaSummaryCard
              driverName={driverName}
              truckNumber={truckNumber}
              rows={(() => {
                // Effective form: empty form.jobActivityName gets the
                // well-derived fallback so legacy saves don't render as
                // empty brackets. Per-row jobType is untouched.
                const effectiveForm = {
                  jobActivityName: jobActivityName || wellsSynthActivity,
                  task: (params.task as string | undefined) || undefined,
                  jsaType: (params.jsaType as string | undefined) || undefined,
                };
                const built = buildLocationActivityRows(wellsList, locationsList, effectiveForm);
                // Field-debug trace — one line per row with raw values,
                // final resolved value, its type, and JSON form. Gated on
                // __DEV__ so release APKs carry no per-render log cost.
                if (__DEV__) {
                  console.log('[JSA][viewJsa][form]', {
                    paramsJobActivityName: params.jobActivityName,
                    stateJobActivityName: jobActivityName,
                    paramsTask: params.task,
                    paramsJsaType: params.jsaType,
                    wellsSynthActivity,
                    effectiveForm,
                  });
                  for (let i = 0; i < wellsList.length; i++) {
                    const w = wellsList[i] as any;
                    const row = built[i];
                    console.log('[JSA][viewJsa][row]', {
                      index: i,
                      name: typeof w === 'string' ? w : w?.name,
                      rawJobType: typeof w === 'string' ? undefined : w?.jobType,
                      rawJobTypeType: typeof (typeof w === 'string' ? undefined : w?.jobType),
                      formJobActivityName: effectiveForm.jobActivityName,
                      formTask: effectiveForm.task,
                      formJsaType: effectiveForm.jsaType,
                      resolvedActivity: row?.resolvedActivity,
                      resolvedActivityType: typeof row?.resolvedActivity,
                      resolvedActivityJson: JSON.stringify(row?.resolvedActivity),
                    });
                  }
                }
                return built;
              })()}
              date={(params.date as string) || ''}
            />
            {(params.timestamp || params.savedAt) ? (
              <View style={[styles.card, { marginTop: 8 }]}>
                <View style={styles.row}>
                  <Text style={styles.label}>{t("Saved")}</Text>
                  <Text style={styles.value}>{new Date(params.timestamp || params.savedAt || "").toLocaleString()}</Text>
                </View>
              </View>
            ) : null}
          </>
        )}

        {/* Locations section removed — merged with Wells / Locations above */}

        <View style={styles.card}>
          <Text style={styles.title}>{t("PPE Selected")}</Text>
          {ppeList.length ? (
            <View style={styles.list}>
              {ppeList.map((item) => (
                <Text key={item} style={styles.listItem}>
                  • {PPE_LABELS[item] || item}
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
                  • {PREPARED_LABELS[item] || item}
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
            <Text style={styles.value}>{[otherInfo, notes].filter(Boolean).join('\n') || "—"}</Text>
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
            <>
              {params.signatureImage ? (
                <View style={{ backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 4, height: 80, justifyContent: 'center', marginBottom: 6 }}>
                  <Image
                    source={{ uri: (params.signatureImage as string).startsWith('data:') ? params.signatureImage : `data:image/png;base64,${params.signatureImage}` }}
                    // Force black strokes (matches Settings preview + PDF).
                    style={{ width: '100%', height: 72, tintColor: '#000' }}
                    resizeMode="contain"
                  />
                </View>
              ) : null}
              <Text style={[styles.value, { textAlign: 'left' }]}>{signature || "—"}</Text>
            </>
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
