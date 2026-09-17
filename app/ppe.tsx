import MoreMenu from '../components/MoreMenu';
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  type KeyboardEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { JsaSummaryCard, buildLocationActivityRows } from "../components/jsa";
import GovernedIsolationSurface from "../components/GovernedIsolationSurface";
import { colors } from "../constants/colors";
import { PPE_ITEMS, type PpeItem } from "../constants/jsaTemplate";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";
import { keyboardRevealOffset } from '../utils/keyboardRevealOffset';

type Params = {
  operator?:string;
  assessmentSteps?: string;
  assessmentBundle?: string;
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
  jsaSessionId?: string;
  stepAcks?: string;
  stepsAcknowledged?: string;
};

export default function PpeScreen() {
  const {
    operator = '',
    assessmentSteps = '',
    assessmentBundle = '',
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
    jsaSessionId = "",
    stepAcks = "{}",
    stepsAcknowledged = "",
  } = useLocalSearchParams<Params>();
  const resolvedTask = jsaType || task;
  const router = useRouter();
  const { t } = useLanguage();
  const { accent, jsaTemplate } = useTheme();
  const bundle=useMemo(()=>{try{return assessmentBundle?JSON.parse(assessmentBundle):null;}catch{return null;}},[assessmentBundle]);
  const ppeItemsList: PpeItem[] = bundle?.ppeItems ?? jsaTemplate?.ppeItems ?? PPE_ITEMS;
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [otherItems, setOtherItems] = useState<string[]>([]); // List of added "other" PPE items
  const [otherInput, setOtherInput] = useState(""); // Current text input for adding new items
  const isLoadedRef = useRef(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const otherInputRef = useRef<TextInput>(null);
  const viewportRef = useRef<View>(null);
  const scrollOffset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const revealFrame = useRef<number | null>(null);
  const [keyboardHeight,setKeyboardHeight] = useState(0);
  const revealOtherInput = useCallback(() => {
    if(revealFrame.current!==null)cancelAnimationFrame(revealFrame.current);
    // Measure after keyboard padding/native resize has committed. Do not use
    // the legacy scroll-responder keyboard helper (unreliable with Fabric).
    revealFrame.current=requestAnimationFrame(()=>{
      revealFrame.current=null;
      if(!otherInputRef.current?.isFocused() || keyboardTop.current===null)return;
      viewportRef.current?.measureInWindow((_x,y,_w,height)=>{
        otherInputRef.current?.measureInWindow((_ix,iy,_iw,ih)=>{
          if(!otherInputRef.current?.isFocused() || keyboardTop.current===null)return;
          const next=keyboardRevealOffset(scrollOffset.current,iy+ih,y+height,keyboardTop.current);
          if(next>scrollOffset.current)scrollViewRef.current?.scrollTo({y:next,animated:true});
        });
      });
    });
  },[]);
  useEffect(() => {
    const updateKeyboard = (event:KeyboardEvent)=>{
      keyboardTop.current=event.endCoordinates.screenY;
      setKeyboardHeight(event.endCoordinates.height);
      revealOtherInput();
    };
    const shown = Keyboard.addListener('keyboardDidShow', updateKeyboard);
    const changed = Keyboard.addListener('keyboardDidChangeFrame', updateKeyboard);
    const hidden=Keyboard.addListener('keyboardDidHide',()=>{keyboardTop.current=null;setKeyboardHeight(0);});
    return () => {shown.remove();changed.remove();hidden.remove();if(revealFrame.current!==null)cancelAnimationFrame(revealFrame.current);};
  }, [revealOtherInput]);
  const [jobWells, setJobWells] = useState('[]');
  const [jobWellName, setJobWellName] = useState('');
  const [jobActivity, setJobActivity] = useState('');
  const [jobGate, setJobGate] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [jobSource, setJobSource] = useState<'governed_snapshot' | 'nav_params' | null>(null);
  const [attestScope, setAttestScope] = useState<{ kind: 'governed' | 'standalone'; scopeId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      isLoadedRef.current = false;
      try {
        const { resolveGovernedJobHandoff } = await import('../services/sso/jsaGovernedJobLive');
        const { decideGovernedJobScreen, jobWorkflowMayAdvance } = await import('../services/sso/jsaGovernedJobFields');
        const { populate, handoff } = await resolveGovernedJobHandoff({
          wellsParam: typeof wells === 'string' ? wells : '[]',
          wellNameParam: typeof wellName === 'string' ? wellName : '',
          jobActivityParam: typeof jobActivityName === 'string' ? jobActivityName : '',
        });
        if (cancelled) return;
        const dest = decideGovernedJobScreen(populate);
        if (dest === 'fail') {
          setJobGate('failed');
          router.replace({ pathname: '/governed-status', params: { mode: 'fail', refusal: 'malformed' } } as any);
          return;
        }
        if (dest === 'completed') {
          setJobGate('failed');
          const { resolveCompletedTerminalHref } = await import('../services/sso/jsaGovernedRoute');
          router.replace((await resolveCompletedTerminalHref()) as any);
          return;
        }
        if (dest === 'acknowledge') {
          setJobGate('failed');
          router.replace('/acknowledge' as any);
          return;
        }
        if (!jobWorkflowMayAdvance({ resolution: 'ready', handoff })) {
          setJobGate('failed');
          router.replace({ pathname: '/governed-status', params: { mode: 'fail', refusal: 'malformed' } } as any);
          return;
        }
        const {
          decideAttestationScope,
          readAttestationDraft,
          forgetLegacyAttestationKeys,
        } = await import('../services/sso/jsaAttestationScope');
        const scopeDec = decideAttestationScope({
          source: handoff.source,
          governedRequestId: handoff.requestId,
          standaloneSessionId: typeof jsaSessionId === 'string' ? jsaSessionId : '',
        });
        if (handoff.source === 'governed_snapshot' && scopeDec.kind !== 'ready') {
          setJobGate('failed');
          router.replace({ pathname: '/governed-status', params: { mode: 'fail', refusal: 'malformed' } } as any);
          return;
        }
        if (scopeDec.kind === 'ready') {
          const draft = await readAttestationDraft(AsyncStorage, scopeDec.scope);
          await forgetLegacyAttestationKeys(AsyncStorage);
          if (cancelled) return;
          setSelected(draft.ppeSelected);
          setOtherItems(draft.ppeOther);
          setAttestScope(scopeDec.scope);
        } else {
          setSelected({});
          setOtherItems([]);
          setAttestScope(null);
        }
        isLoadedRef.current = true;
        setJobWells(handoff.wells);
        setJobWellName(handoff.wellName);
        setJobActivity(handoff.jobActivityName);
        setJobSource(handoff.source === 'governed_snapshot' || handoff.source === 'nav_params' ? handoff.source : null);
        setJobGate('ready');
      } catch {
        if (!cancelled) {
          setJobGate('failed');
          router.replace('/(tabs)' as any);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [wells, wellName, jobActivityName, jsaSessionId, router]);

  const wellsList = useMemo(() => {
    try {
      const parsed = JSON.parse(jobWells);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [jobWells]);

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
    if (!isLoadedRef.current || !attestScope || jobGate !== 'ready') return;
    void import('../services/sso/jsaAttestationScope').then(({ writeAttestationDraft }) => {
      writeAttestationDraft(AsyncStorage, attestScope, {
        ppeSelected: selected,
        ppeOther: otherItems,
      }).catch((error) => console.warn("Failed to save PPE selections", error));
    });
  }, [selected, otherItems, attestScope, jobGate]);

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

  // Pre-resolve rows at the data layer. JsaSummaryCard no longer does any
  // fallback lookups — each row's resolvedActivity is baked in here.
  const summaryRows = useMemo(() => (
    buildLocationActivityRows(
      wellsList,
      locationsList,
      {
        jobActivityName: jobActivity,
        task: jobSource === 'nav_params' ? (jobActivity || task) : jobActivity,
        jsaType: jobSource === 'nav_params' ? jsaType : '',
      },
    )
  ), [wellsList, locationsList, jobActivity, jobSource, task, jsaType]);

  const toggleItem = (item: PpeItem) => {
    setSelected((prev) => ({
      ...prev,
      [item.id]: !prev[item.id],
    }));
  };

  const isChecked = (id: string) => !!selected[id];

  const handleNext = () => {
    if (jobGate !== 'ready' || !jobSource) return;
    router.push({
      pathname: "/signoff",
      params: {
        driverName,
        truckNumber,
        jobActivityName: jobActivity,
        pusher,
        wellName: jobWellName,
        wells: JSON.stringify(wellsList),
        otherInfo,
        location: locationsList[0] || location || "",
        locations: JSON.stringify(locationsList),
        locationAcks,
        task: jobActivity,
        date,
        ppeSelected: JSON.stringify({ selected, otherItems }),
        jsaSessionId,
        stepAcks,
        stepsAcknowledged,
        assessmentSteps,
        assessmentBundle,
        operator,
      },
    });
  };

  if (jobGate !== 'ready') {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: 'transparent' }}>
        <GovernedIsolationSurface kind="connecting" variant="overlay" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <Stack.Screen
        options={{
          title: t("PPE Checklist"),
          headerBackTitle: t("Steps & Hazards"),
          headerRight: () => <MoreMenu />,
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        enabled={Platform.OS === 'ios'}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View ref={viewportRef} collapsable={false} style={styles.flex} onLayout={revealOtherInput}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={[styles.content,Platform.OS==='android' && keyboardHeight>0 && {paddingBottom:16+keyboardHeight}]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="none"
          keyboardShouldPersistTaps="handled"
          onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y;}}
          scrollEventThrottle={16}
          onContentSizeChange={revealOtherInput}
        >
          {/* Summary */}
          <JsaSummaryCard
            compact
            driverName={driverName}
            truckNumber={truckNumber}
            rows={summaryRows}
            date={date}
          />

        {/* Checklist */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("PPE Required")}</Text>
          <View style={styles.list}>
            {ppeItemsList.filter((item) => !item.id.toLowerCase().startsWith("other")).map((item) => {
              const checked = isChecked(item.id);
              return (
                <TouchableOpacity key={item.id}
                    onPress={() => toggleItem(item)}
                    style={[styles.listRow, styles.checklistRow]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={t(item.label)}
                    activeOpacity={0.8}
                  >
                  <View style={[styles.checkbox, { borderColor: accent }, checked && [styles.checkboxChecked, { backgroundColor: accent }]]}>
                    {checked && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                  <Text style={styles.itemLabel}>{t(item.label)}</Text>
                </TouchableOpacity>
              );
            })}

            {/* Other PPE input */}
            <View style={styles.otherSection}>
              <View style={styles.listRow}>
              <TextInput
                ref={otherInputRef}
                style={styles.otherInput}
                placeholder={t("Enter other PPE")}
                accessibilityLabel={t("Other PPE")}
                placeholderTextColor={colors.textMuted}
                value={otherInput}
                onChangeText={setOtherInput}
                onSubmitEditing={addOtherItem}
                onFocus={revealOtherInput}
                returnKeyType="done"
                blurOnSubmit={false}
              />
              <TouchableOpacity
                accessibilityLabel={t("Add other PPE")}
                onPress={addOtherItem}
                disabled={!otherInput.trim()}
                style={[styles.otherAdd, { backgroundColor: accent, opacity: otherInput.trim() ? 1 : 0.45 }]}
              >
                <Text style={styles.nextButtonText}>{t("Add")}</Text>
              </TouchableOpacity>
              </View>
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
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  otherSection: { gap: 8, marginTop: 4 },
  otherAdd: { minHeight: 44, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent",
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 12,
    paddingBottom: 12,
    gap: 8,
  },
  summaryCard: {
    backgroundColor: "rgba(255,255,255,0.94)",
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
  summaryRowValue: {
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
    marginBottom: 4,
  },
  list: {
    gap: 0,
  },
  checklistRow: { minHeight: 40, paddingVertical: 4 },
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
    marginTop: 0,
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
