import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import { WebView } from "react-native-webview";
import { PrimaryButton } from "../components/jsa";
import { colors } from "../constants/colors";
import { buildJsaPdfHtml } from "../services/jsaPdfHtml";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";
import { syncToCloud } from "../services/sync";

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
  signatureImage?: string;
};

export default function CompletedScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();
  const { accent, emergencyContacts: themeEmergencyContacts, companyContacts: themeCompanyContacts, logoUrl } = useTheme();
  const [isExporting, setIsExporting] = useState(false);

  // Auto-sync to Firestore on completion (fire-and-forget)
  React.useEffect(() => {
    syncToCloud().catch(() => {});
  }, []);

  // Load location stamps from jsa_day_status for the PDF
  const [locationStamps, setLocationStamps] = useState<any[]>([]);
  React.useEffect(() => {
    (async () => {
      try {
        const { getDriverSession } = await import('../services/driverAuth');
        const session = await getDriverSession();
        if (!session?.passcodeHash) return;
        const todayStr = new Date().toISOString().slice(0, 10);
        const docId = `${session.passcodeHash}_${todayStr}`;
        const url = `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/jsa_day_status/${docId}?key=AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const doc = await resp.json();
        const vals = doc.fields?.wells?.arrayValue?.values;
        if (!Array.isArray(vals)) return;
        const stamps = vals.map((v: any) => {
          const f = v?.mapValue?.fields;
          return f ? {
            name: f.name?.stringValue || '',
            type: f.type?.stringValue || 'pickup',
            jobType: f.jobType?.stringValue || '',
            stampedAt: f.stampedAt?.timestampValue || f.stampedAt?.stringValue || '',
          } : null;
        }).filter(Boolean);
        if (stamps.length > 0) setLocationStamps(stamps);
      } catch {}
    })();
  }, []);

  // Parse PPE and prepared items for PDF
  const ppeItems = useMemo(() => {
    try {
      const parsed = params.ppeSelected ? JSON.parse(params.ppeSelected as string) : {};
      if (parsed?.selected) return Object.entries(parsed.selected).filter(([, v]) => v).map(([k]) => k);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }, [params.ppeSelected]);

  const preparedItems = useMemo(() => {
    try {
      const parsed = params.prepared ? JSON.parse(params.prepared as string) : {};
      if (parsed && typeof parsed === 'object') return Object.entries(parsed).filter(([, v]) => v).map(([k]) => k);
    } catch {}
    return [];
  }, [params.prepared]);

  const locationsList = useMemo(() => {
    try {
      const parsed = params.locations ? JSON.parse(params.locations as string) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }, [params.locations]);

  const locationAcks = useMemo(() => {
    try {
      const parsed = params.locationAcks ? JSON.parse(params.locationAcks as string) : {};
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
    return {};
  }, [params.locationAcks]);

  // Parse wells array for PDF
  const wellsArray = useMemo(() => {
    try {
      const parsed = params.wells ? JSON.parse(params.wells as string) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return [];
  }, [params.wells]);

  // Build PDF HTML for inline preview + export
  const pdfHtml = useMemo(() => buildJsaPdfHtml({
    driverName: (params.driverName as string) || '',
    truckNumber: (params.truckNumber as string) || '',
    pusher: (params.pusher as string) || '',
    wellName: (params.wellName as string) || '',
    wells: wellsArray.length > 0 ? wellsArray : undefined,
    jobActivity: (params.jobActivityName as string) || (params.task as string) || '',
    date: (params.date as string) || '',
    notes: (params.notes as string) || '',
    signature: (params.signature as string) || '',
    signatureImage: (params.signatureImage as string) || undefined,
    locations: locationsList,
    locationAcks,
    locationStamps: locationStamps.length > 0 ? locationStamps : undefined,
    ppeItems,
    preparedItems,
    emergencyContacts: themeEmergencyContacts,
    companyContacts: themeCompanyContacts,
    accent,
    logoDataUrl: logoUrl,
  }), [params, wellsArray, ppeItems, preparedItems, locationsList, locationAcks, locationStamps, themeEmergencyContacts, themeCompanyContacts, accent, logoUrl]);

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: pdfHtml });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri);
      } else {
        await Print.printAsync({ uri });
      }
    } catch (err) {
      console.warn('[JSA] PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Completed"),
          headerBackTitle: t("Sign Off"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/(tabs)")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: '#fff', fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <View style={{ flex: 1 }}>
        {/* Success header */}
        <View style={{ alignItems: 'center', paddingVertical: 12, backgroundColor: colors.background }}>
          <View style={[styles.checkCircle, { borderColor: accent }]}>
            <Ionicons name="checkmark" size={36} color={accent} />
          </View>
          <Text style={styles.title}>{t("JSA Completed")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 2 }}>
            {params.date} — {params.driverName}
          </Text>
        </View>

        {/* Inline PDF preview */}
        <View style={{ flex: 1, marginHorizontal: 12, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          <WebView
            source={{ html: pdfHtml }}
            style={{ flex: 1, backgroundColor: '#f5f5f5' }}
            scrollEnabled={true}
            scalesPageToFit={true}
          />
        </View>

        {/* Action buttons */}
        <View style={{ padding: 12, gap: 8 }}>
          <PrimaryButton
            title={isExporting ? t("Exporting...") : t("Export / Share PDF")}
            accent={accent}
            onPress={handleExportPdf}
            disabled={isExporting}
          />

          <PrimaryButton
            title={t("Done — Return to Work")}
            variant="secondary"
            accent={accent}
            onPress={async () => {
              try {
                const returnTo = await AsyncStorage.getItem('jsa_returnTo');
                if (returnTo) {
                  await AsyncStorage.removeItem('jsa_returnTo');
                  const pdfUrl = await AsyncStorage.getItem('jsa_pdfUrl').catch(() => null);
                  const returnUrl = pdfUrl
                    ? `${returnTo}://resume?jsaPdfUrl=${encodeURIComponent(pdfUrl)}`
                    : `${returnTo}://resume`;
                  await Linking.openURL(returnUrl);
                  return;
                }
              } catch {}
              router.replace("/(tabs)");
            }}
          />
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
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textDark,
    textAlign: "center",
    marginBottom: 0,
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
