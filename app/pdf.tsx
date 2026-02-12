import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COMPANY_CONTACTS, EMERGENCY_CONTACTS } from "../constants/jsaTemplate";
import { useLanguage } from "./contexts/LanguageContext";

const colors = {
  gold: "#F5A623",
  goldDark: "#D68910",
  background: "#F5F5F5",
  card: "#FFFFFF",
  textDark: "#111111",
  textMuted: "#666666",
  border: "#E0E0E0",
};

type Params = {
  driverName?: string;
  truckNumber?: string;
  location?: string;
  pusher?: string;
  wellName?: string;
  task?: string;
  jsaType?: string;
  date?: string;
  ppeSelected?: string;
  prepared?: string;
  notes?: string;
  signature?: string;
  locations?: string;
  locationAcks?: string;
};

export default function PdfScreen() {
  const params = useLocalSearchParams<any>();
  const router = useRouter();
  const { t } = useLanguage();
  const [isGenerating, setIsGenerating] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const ppeSelectedArray = useMemo(() => {
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

  const preparedArray = useMemo(() => {
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

  React.useEffect(() => {
    const loadLogo = async () => {
      try {
        const asset = Asset.fromModule(require("../assets/images/company-logo-transparent.png"));
        await asset.downloadAsync();
        const fileUri = asset.localUri || asset.uri;
        if (!fileUri) return;
        const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: "base64" });
        setLogoDataUrl(`data:image/png;base64,${base64}`);
      } catch (error) {
        console.warn("Failed to load logo for PDF", error);
      }
    };
    loadLogo();
  }, []);

  const html = useMemo(() => {
    const emergencyContacts = EMERGENCY_CONTACTS;
    const companyContacts = COMPANY_CONTACTS;
    const driverName = params.driverName || "";
    const truckNumber = params.truckNumber || "";
    const pusher = params.pusher || "";
    const wellName = params.wellName || "";
    const location = params.location || "";
    const task = params.task || "";
    const date = params.date || "";
    const notes = params.notes || "";
    const signature = params.signature || "";
    let locationAcks: Record<string, string> = {};
    let locationsList: string[] = [];
    try {
      if (params.locations) {
        const parsed = JSON.parse(params.locations);
        if (Array.isArray(parsed)) {
          locationsList = parsed;
        }
      }
    } catch {
      locationsList = [];
    }
    try {
      if (params.locationAcks) {
        const parsed = JSON.parse(params.locationAcks);
        if (parsed && typeof parsed === "object") {
          locationAcks = parsed;
        }
      }
    } catch {
      locationAcks = {};
    }

    if (!locationsList.length && location) {
      locationsList = [location];
    }
    const jobLocationsValue = locationsList.length
      ? locationsList.join(", ")
      : location || "-";

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Job Safety Analysis</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: #f5f5f5;
      color: #111111;
    }
    .page {
      padding: 24px 20px 32px;
    }
    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 16px;
    }
    .title-block {
      flex: 1;
    }
    .logo img {
      width: 72px;
      height: 72px;
      object-fit: contain;
    }
    .title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    .subtitle {
      margin: 4px 0 0;
      font-size: 12px;
      color: #666666;
    }
    .tag-row {
      margin-top: 6px;
      font-size: 11px;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .tag {
      padding: 2px 8px;
      border-radius: 999px;
      background: #F5A623;
      color: #111111;
      font-weight: 500;
    }
    .section {
      background: #ffffff;
      border-radius: 12px;
      padding: 12px 14px;
      margin-bottom: 10px;
      border: 1px solid #e0e0e0;
    }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #666666;
      margin: 0 0 4px;
      font-weight: 600;
    }
    .row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      padding: 2px 0;
    }
    .row-label {
      color: #666666;
    }
    .row-value {
      font-weight: 500;
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
      font-size: 11px;
    }
    .pill {
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid #F5A623;
      color: #111111;
      background: #fff7d6;
    }
    .checklist-item {
      font-size: 12px;
      padding: 2px 0;
    }
    .notes {
      font-size: 12px;
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-top: 8px;
    }
    .signature-label {
      color: #666666;
    }
    .signature-value {
      font-weight: 600;
      border-bottom: 1px solid #cccccc;
      padding-bottom: 2px;
      min-width: 160px;
      text-align: right;
    }
    .badge-strip {
      display: flex;
      gap: 8px;
      margin-top: 4px;
      font-size: 11px;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #e0e0e0;
      background: #ffffff;
    }
    .badge-okay {
      border-color: #e0e0e0;
      color: #111111;
      background: #ffffff;
      font-weight: 500;
    }
    .contact-row {
      font-size: 11px;
      padding: 2px 0;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .contact-label {
      max-width: 70%;
    }
    .contact-phone {
      font-weight: 600;
      text-align: right;
      min-width: 30%;
    }
    .locations-list {
      font-size: 12px;
      line-height: 1.4;
    }
    .locations-list div {
      margin-bottom: 2px;
    }
    .ack {
      color: #666666;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="title-block">
        <h1 class="title">Job Safety Analysis</h1>
        <div class="tag-row">
          <span class="tag">JSA</span>
          <span class="tag">Field Operations</span>
        </div>
      </div>
      ${
        logoDataUrl
          ? `<div><img src="${logoDataUrl}" alt="Company logo" /></div>`
          : ""
      }
    </div>

    <!-- Job Details -->
    <div class="section">
      <h2 class="section-title">Job Details</h2>
      <div class="row">
        <span class="row-label">Driver</span>
        <span class="row-value">${driverName || "-"}</span>
      </div>
      <div class="row">
        <span class="row-label">Truck #</span>
        <span class="row-value">${truckNumber || "-"}</span>
      </div>
      <div class="row">
        <span class="row-label">Pusher</span>
        <span class="row-value">${pusher || "-"}</span>
      </div>
      <div class="row">
        <span class="row-label">Well</span>
        <span class="row-value">${wellName || "-"}</span>
      </div>
      <div class="row">
        <span class="row-label">Location</span>
        <span class="row-value">${jobLocationsValue}</span>
      </div>
      <div class="row">
        <span class="row-label">Task</span>
        <span class="row-value">${task || "-"}</span>
      </div>
      <div class="row">
        <span class="row-label">Date</span>
        <span class="row-value">${date || "-"}</span>
      </div>
      <div class="badge-strip">
        <div class="badge badge-okay">JSA Reviewed</div>
        <div class="badge">Generated: ${new Date().toLocaleString()}</div>
      </div>
    </div>

    <!-- PPE -->
    <div class="section">
      <h2 class="section-title">PPE Selected</h2>
      <p style="font-size: 11px; color: #666666; margin: 0 0 4px;">
        Verified personal protective equipment for this job.
      </p>
      <div class="pill-row">
        ${(ppeSelectedArray || [])
          .map((item) => `<span class="pill">${item}</span>`)
          .join("") || '<span style="font-size: 11px; color: #999999;">No PPE recorded</span>'}
      </div>
    </div>

    <!-- Prepared for Work -->
    <div class="section">
      <h2 class="section-title">Prepared for Work</h2>
      <div class="checklist-item">
        ${preparedArray.includes("trained") ? "☑" : "☐"} I am properly trained for the job
      </div>
      <div class="checklist-item">
        ${preparedArray.includes("toolsAndPpe") ? "☑" : "☐"} I have the tools and PPE needed for work
      </div>
      <div class="checklist-item">
        ${preparedArray.includes("sds") ? "☑" : "☐"} SDS
      </div>
    </div>

    <!-- Locations -->
    <div class="section">
      <h2 class="section-title">Locations</h2>
      <div class="locations-list">
        ${locationsList.length
          ? locationsList
              .map(
                (loc) =>
                  `<div>${loc}${
                    locationAcks[loc]
                      ? `<div class="ack">Ack: ${new Date(locationAcks[loc]).toLocaleString()}</div>`
                      : ""
                  }</div>`
              )
              .join("")
          : '<div style="color:#999999;">No locations recorded.</div>'}
      </div>
    </div>

    <!-- Notes & Signature -->
    <div class="section">
      <h2 class="section-title">Notes & Signature</h2>
      <div>
        <div style="font-size: 11px; color: #666666; margin-bottom: 4px;">
          Additional Notes
        </div>
        <div class="notes">
          ${notes && notes.trim().length ? notes.trim() : "No additional notes provided."}
        </div>
      </div>
      <div class="signature-row">
        <span class="signature-label">Signature</span>
        <span class="signature-value">${signature || ""}</span>
      </div>
    </div>

    <!-- Emergency & Company Contacts -->
    <div class="section">
      <h2 class="section-title">Emergency Contacts</h2>
      ${emergencyContacts
        .map(
          (c) => `
        <div class="contact-row">
          <span class="contact-label">${c.label}</span>
          <span class="contact-phone">${c.phone}</span>
        </div>
      `
        )
        .join("")}
    </div>

    <div class="section">
      <h2 class="section-title">Company Contacts</h2>
      ${companyContacts
        .map(
          (c) => `
        <div class="contact-row">
          <span class="contact-label">${c.label}</span>
          <span class="contact-phone">${c.phone}</span>
        </div>
      `
        )
        .join("")}
    </div>
  </div>
</body>
</html>
`;
  }, [
    params.driverName,
    params.truckNumber,
    params.location,
    params.task,
    params.date,
    params.notes,
    params.signature,
    ppeSelectedArray,
    preparedArray,
  ]);

  const handleGeneratePdf = async () => {
    setIsGenerating(true);
    try {
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri);
      } else {
        await Print.printAsync({ uri });
      }
    } catch (error) {
      console.warn("Failed to generate/share PDF", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("PDF Preview"),
          headerBackTitle: t("Sign Off"),
          headerRight: () => (
            <TouchableOpacity onPress={() => router.replace("/")} style={{ paddingHorizontal: 10 }}>
              <Text style={{ color: colors.gold, fontWeight: "700", fontSize: 14 }}>{t("Home")}</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{t("Job Safety Analysis Report")}</Text>
          <Text style={styles.muted}>{t("Generate PDF JSA report for this job.")}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, isGenerating && styles.buttonDisabled]}
          onPress={handleGeneratePdf}
          disabled={isGenerating}
        >
          <Text style={styles.buttonText}>
            {isGenerating ? t("Generating...") : t("Generate & Share PDF")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondary]}
          onPress={() => router.replace("/")}
        >
          <Text style={[styles.buttonText, styles.secondaryText]}>{t("Back to Start")}</Text>
        </TouchableOpacity>
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
    fontSize: 20,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 6,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.gold,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  secondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  secondaryText: {
    color: colors.goldDark,
  },
});
