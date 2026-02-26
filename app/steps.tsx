import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming
} from "react-native-reanimated";

import { colors } from "../constants/colors";
import { JSA_STEPS, JSAStep } from "../constants/jsaTemplate";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

// Extended colors specific to steps screen
const stepColors = {
  primarySoft: "#FDECC8",
  borderStrong: "#CFCFCF",
};

type Params = {
  driverName?: string;
  truckNumber?: string;
  location?: string;
  task?: string;
  date?: string;
  locations?: string;
  wells?: string;
  locationAcks?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  otherInfo?: string;
  jsaSessionId?: string;
};

export default function StepsScreen() {
  const params = useLocalSearchParams<{
  driverName?: string;
  truckNumber?: string;
  location?: string;
  locations?: string;
  wells?: string;
  locationAcks?: string;
  task?: string;
  date?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  otherInfo?: string;
  jsaSessionId?: string;
}>();

const driverName = (params.driverName as string) || "";
const truckNumber = (params.truckNumber as string) || "";
const location = (params.location as string) || "";
const locations = (params.locations as string) || "[]";
const wells = (params.wells as string) || "[]";
const locationAcks = (params.locationAcks as string) || "";
const task = (params.task as string) || "";
const date = (params.date as string) || "";
const jobActivityName = (params.jobActivityName as string) || "";
const pusher = (params.pusher as string) || "";
const wellName = (params.wellName as string) || "";
const otherInfo = (params.otherInfo as string) || "";
const jsaSessionId = (params.jsaSessionId as string) || "";

// Parse wells and locations arrays
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

  const router = useRouter();
  const { t } = useLanguage();
  const { accent } = useTheme();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set()); // Steps that have been navigated away from
  const checkScale = useSharedValue(0);
  const checkOpacity = useSharedValue(0);

  // Reset completed steps when starting a new JSA (session ID changes)
  useEffect(() => {
    setCurrentStepIndex(0);
    setCompletedSteps(new Set());
  }, [jsaSessionId]);
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkOpacity.value,
  }));

  const currentStep = JSA_STEPS[currentStepIndex];
  const totalSteps = JSA_STEPS.length;
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === totalSteps - 1;

  const triggerCheck = useCallback(() => {
    checkScale.value = 1;
    checkOpacity.value = 0;
    checkOpacity.value = withSequence(
      withTiming(1, { duration: 120 }),
      withDelay(200, withTiming(0, { duration: 150 }))
    );
  }, [checkOpacity, checkScale]);

  const renderStepCard = (step: JSAStep) => {
    return (
      <View key={step.id} style={styles.stepCard}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepBadge}>
            {t("Step")} {currentStepIndex + 1} {t("of")} {totalSteps}
          </Text>
          <Text style={styles.stepTitle}>{t(step.title)}</Text>
        </View>

        <View style={styles.stepBody}>
          {step.items.map((item, index) => (
            <View
              key={`${step.id}-${index}`}
              style={[
                styles.hazardBlock,
                index === step.items.length - 1 && styles.hazardBlockLast
              ]}
            >
              <Text style={styles.hazardRow}>
                <Text style={styles.hazardLabel}>{t("Hazard:")} </Text>
                <Text style={styles.hazardText}>{t(item.hazard)}</Text>
              </Text>
              <Text style={styles.controlsRow}>
                <Text style={styles.controlsLabel}>{t("Controls:")} </Text>
                <Text style={styles.controlsText}>{t(item.controls)}</Text>
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Steps & Hazards"),
          headerBackTitle: t("Job Details"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: accent, fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.flex}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Driver Name")}</Text>
              <Text style={styles.summaryValue}>{driverName || "-"}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Truck #")}</Text>
              <Text style={styles.summaryValue}>{truckNumber || "-"}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Job/Activity")}</Text>
              <Text style={styles.summaryValue}>{jobActivityName || "-"}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Pusher")}</Text>
              <Text style={styles.summaryValue}>{pusher || "-"}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Wells")}</Text>
              <Text style={styles.summaryValue}>
                {wellsList.length > 0 ? wellsList.join(", ") : wellName || "-"}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Locations")}</Text>
              <Text style={styles.summaryValue}>
                {locationsList.length > 0 ? locationsList.join(", ") : location || "-"}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Date")}</Text>
              <Text style={styles.summaryValue}>{date || "-"}</Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t("Other Info")}</Text>
              <Text style={styles.summaryValue}>{otherInfo || "-"}</Text>
            </View>
          </View>

          {/* Step */}
          <View style={{ marginTop: 16 }}>{renderStepCard(currentStep)}</View>
        </ScrollView>

        {/* Navigation */}
        <View style={styles.navBar}>
          <View style={styles.navRow}>
            <View style={styles.progressGroup}>
              <Text style={styles.progressText}>
                {currentStepIndex + 1} / {totalSteps}
              </Text>
              {completedSteps.has(currentStepIndex) ? (
                <View style={[styles.progressCheck, { backgroundColor: accent }]}>
                  <Text style={styles.progressCheckText}>✓</Text>
                </View>
              ) : (
                <Animated.View style={[styles.progressCheck, { backgroundColor: accent }, checkStyle]}>
                  <Text style={styles.progressCheckText}>✓</Text>
                </Animated.View>
              )}
            </View>
            <View style={styles.navButtons}>
              <TouchableOpacity
                style={[
                  styles.navButton,
                  { borderColor: accent },
                  isFirst && styles.navButtonDisabled,
                ]}
                onPress={() => {
                  // Mark current step as completed before going back
                  setCompletedSteps((prev) => new Set(prev).add(currentStepIndex));
                  const newIndex = Math.max(0, currentStepIndex - 1);
                  setCurrentStepIndex(newIndex);
                }}
                disabled={isFirst}
              >
                <Text
                  style={[
                    styles.navButtonText,
                    isFirst && styles.navButtonTextDisabled,
                  ]}
                >
                  {t("Previous")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navButton, { borderColor: accent }]}
                onPress={() => {
                  triggerCheck();
                  const proceed = () => {
                    if (isLast) {
                      router.push({
                        pathname: "/ppe",
                        params: {
                          driverName,
                          truckNumber,
                          jobActivityName,
                          pusher,
                          wellName,
                          wells,
                          otherInfo,
                          location,
                          locations,
                          locationAcks,
                          task,
                          date,
                        },
                      });
                    } else {
                      // Mark current step as completed before moving forward
                      setCompletedSteps((prev) => new Set(prev).add(currentStepIndex));
                      const newIndex = Math.min(totalSteps - 1, currentStepIndex + 1);
                      setCurrentStepIndex(newIndex);
                    }
                  };
                  setTimeout(proceed, 350);
                }}
              >
                <Text
                  style={styles.navButtonText}
                >
                  {isLast ? t("PPE Checklist") : t("Next")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textMuted,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textDark,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  stepCard: {
    backgroundColor: stepColors.primarySoft,
    borderRadius: 12,
    marginBottom: 10,
    overflow: "hidden",
    position: "relative",
  },
  stepHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepBadge: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textDark,
  },
  stepBody: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFF2C2",
    gap: 16,
  },
  hazardBlock: {
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  hazardRow: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textDark,
    marginBottom: 6,
    lineHeight: 20,
  },
  hazardLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
  },
  hazardText: {
    fontSize: 14,
    fontWeight: "600",
  },
  controlsRow: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textDark,
    marginTop: 8,
    lineHeight: 20,
  },
  controlsLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
  },
  controlsText: {
    fontSize: 14,
    color: colors.textDark,
    fontWeight: "600",
  },
  hazardBlockLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  progressGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  progressCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  progressCheckText: {
    color: colors.textDark,
    fontWeight: "800",
    fontSize: 14,
  },
  navBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card,
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  navButtons: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.card,
  },
  navButtonDisabled: {
    borderColor: stepColors.borderStrong,
    backgroundColor: "#F1F1F1",
  },
  navButtonText: {
    color: colors.textDark,
    fontWeight: "700",
  },
  navButtonTextDisabled: {
    color: colors.textMuted,
  },
});
