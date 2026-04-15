import { Stack, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";

import SignatureModal from "../components/SignatureModal";
import { colors } from "../constants/colors";
import { fetchDriverProfile } from "../services/driverAuth";
import { useAuth } from "./contexts/AuthContext";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

const FIREBASE_DB = 'https://wellbuilt-sync-default-rtdb.firebaseio.com';

type Contact = { label: string; phone: string };

export default function SettingsScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { accent, emergencyContacts: themeEmergencyContacts, companyContacts: themeCompanyContacts } = useTheme();

  // Profile fields
  const [legalName, setLegalName] = useState(session?.legalName || session?.displayName || "");
  const [truckNumber, setTruckNumber] = useState("");
  const [trailerNumber, setTrailerNumber] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);

  // Standalone contacts (only editable when no companyId)
  const isStandalone = !session?.companyId;
  const [emergencyContacts, setEmergencyContacts] = useState<Contact[]>([]);
  const [companyContacts, setCompanyContacts] = useState<Contact[]>([]);
  const [newEmLabel, setNewEmLabel] = useState("");
  const [newEmPhone, setNewEmPhone] = useState("");
  const [newCoLabel, setNewCoLabel] = useState("");
  const [newCoPhone, setNewCoPhone] = useState("");

  // Load profile data
  useEffect(() => {
    (async () => {
      try {
        // Load truck/trailer from AsyncStorage
        const [truck, trailer] = await Promise.all([
          AsyncStorage.getItem("@jsa/truckNumber"),
          AsyncStorage.getItem("@jsa/trailerNumber"),
        ]);
        if (truck) setTruckNumber(truck);
        if (trailer) setTrailerNumber(trailer);

        // Load signature from Firebase profile
        const profile = await fetchDriverProfile();
        if (profile?.signature) setSignatureImage(profile.signature);
        if (profile?.truckNumber) setTruckNumber(profile.truckNumber);
        if (profile?.trailerNumber) setTrailerNumber(profile.trailerNumber);
        if (profile?.legalName) setLegalName(profile.legalName);

        // Load standalone contacts
        if (isStandalone) {
          const stored = await AsyncStorage.getItem("@jsa/standaloneContacts");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed.emergency) setEmergencyContacts(parsed.emergency);
            if (parsed.company) setCompanyContacts(parsed.company);
          }
        }
      } catch (err) {
        console.warn("[Settings] Load failed:", err);
      }
    })();
  }, []);

  const saveProfile = async () => {
    try {
      // Save to AsyncStorage
      await Promise.all([
        AsyncStorage.setItem("@jsa/truckNumber", truckNumber),
        AsyncStorage.setItem("@jsa/trailerNumber", trailerNumber),
      ]);

      // Sync to RTDB profile if we have a hash
      if (session?.passcodeHash) {
        const profileUrl = `${FIREBASE_DB}/drivers/approved/${session.passcodeHash}/profile.json`;
        await fetch(profileUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ truckNumber, trailerNumber }),
        });
      }

      Alert.alert(t("Saved"), t("Profile updated successfully."));
    } catch (err) {
      console.warn("[Settings] Save failed:", err);
      Alert.alert(t("Error"), t("Failed to save profile."));
    }
  };

  const saveSignature = async (base64: string) => {
    console.log('[Settings] Signature received, length:', base64?.length, 'starts with:', base64?.substring(0, 30));
    const fullUri = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    setSignatureImage(fullUri);
    // Sync to RTDB profile
    if (session?.passcodeHash) {
      try {
        const profileUrl = `${FIREBASE_DB}/drivers/approved/${session.passcodeHash}/profile.json`;
        await fetch(profileUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signature: base64 }),
        });
      } catch (err) {
        console.warn("[Settings] Signature sync failed:", err);
      }
    }
  };

  const saveStandaloneContacts = async () => {
    try {
      await AsyncStorage.setItem("@jsa/standaloneContacts", JSON.stringify({
        emergency: emergencyContacts,
        company: companyContacts,
      }));
      Alert.alert(t("Saved"), t("Contacts updated successfully."));
    } catch (err) {
      Alert.alert(t("Error"), t("Failed to save contacts."));
    }
  };

  const addEmergencyContact = () => {
    if (!newEmLabel.trim() || !newEmPhone.trim()) return;
    setEmergencyContacts(prev => [...prev, { label: newEmLabel.trim(), phone: newEmPhone.trim() }]);
    setNewEmLabel("");
    setNewEmPhone("");
  };

  const addCompanyContact = () => {
    if (!newCoLabel.trim() || !newCoPhone.trim()) return;
    setCompanyContacts(prev => [...prev, { label: newCoLabel.trim(), phone: newCoPhone.trim() }]);
    setNewCoLabel("");
    setNewCoPhone("");
  };

  const handleLogout = () => {
    Alert.alert(
      t("Sign Out"),
      t("Are you sure you want to sign out?"),
      [
        { text: t("Cancel"), style: "cancel" },
        {
          text: t("Sign Out"),
          style: "destructive",
          onPress: () => {
            logout();
            router.replace("/(tabs)");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Settings"),
          headerBackTitle: t("Back"),
        }}
      />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
      >
        {/* Driver Profile Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("Driver Profile")}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Legal Name")}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: '#f0f0f0' }]}
              value={legalName}
              editable={false}
              placeholderTextColor={colors.textMuted}
            />
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              {t("Name is set from your login profile.")}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Truck #")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("e.g. 105")}
              placeholderTextColor={colors.textMuted}
              value={truckNumber}
              onChangeText={setTruckNumber}
              keyboardType="numeric"
              autoComplete="off"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Trailer #")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("e.g. 205")}
              placeholderTextColor={colors.textMuted}
              value={trailerNumber}
              onChangeText={setTrailerNumber}
              autoComplete="off"
            />
          </View>

          {/* Signature preview — visual only, saves via modal */}
          <View style={{ marginTop: 12 }}>
            <Text style={styles.label}>{t("Signature")}</Text>
            {signatureImage ? (
              <View style={{ backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: colors.border, height: 80, overflow: 'hidden', marginTop: 4 }}>
                <WebView
                  key={signatureImage.substring(signatureImage.length - 20)}
                  source={{ html: `<html><body style="margin:0;padding:0;background:#f0f0f0;display:flex;align-items:center;justify-content:center;height:100vh"><img src="${signatureImage.startsWith('data:') ? signatureImage : `data:image/png;base64,${signatureImage}`}" style="max-width:100%;max-height:80px;object-fit:contain" /></body></html>` }}
                  style={{ flex: 1, backgroundColor: 'transparent' }}
                  scrollEnabled={false}
                />
              </View>
            ) : (
              <View style={{ backgroundColor: '#f5f5f5', borderRadius: 8, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', padding: 16, alignItems: 'center', marginTop: 4 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t("No signature saved.")}</Text>
              </View>
            )}
            <TouchableOpacity onPress={() => setShowSigModal(true)} style={{ marginTop: 6 }}>
              <Text style={{ color: accent, fontSize: 13, fontWeight: '600', textAlign: 'right' }}>
                {signatureImage ? t("Re-sign") : t("Draw Signature")}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: accent }]}
            onPress={saveProfile}
          >
            <Text style={styles.saveButtonText}>{t("Save Profile")}</Text>
          </TouchableOpacity>
        </View>

        {/* Language Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("Language")}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <TouchableOpacity
              style={[
                styles.langButton,
                lang === "en" && { backgroundColor: accent, borderColor: accent },
              ]}
              onPress={() => setLang("en")}
            >
              <Text style={[styles.langText, lang === "en" && { color: "#fff" }]}>English</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.langButton,
                lang === "es" && { backgroundColor: accent, borderColor: accent },
              ]}
              onPress={() => setLang("es")}
            >
              <Text style={[styles.langText, lang === "es" && { color: "#fff" }]}>Español</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Contacts Card — standalone only */}
        {isStandalone ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("Emergency Contacts")}</Text>

            {emergencyContacts.map((c, i) => (
              <View key={i} style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{c.label}</Text>
                  <Text style={styles.contactPhone}>{c.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => setEmergencyContacts(prev => prev.filter((_, idx) => idx !== i))}>
                  <Text style={{ color: '#e53e3e', fontWeight: '600', fontSize: 13 }}>{t("Remove")}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.addContactRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t("Name")}
                placeholderTextColor={colors.textMuted}
                value={newEmLabel}
                onChangeText={setNewEmLabel}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t("Phone")}
                placeholderTextColor={colors.textMuted}
                value={newEmPhone}
                onChangeText={setNewEmPhone}
                keyboardType="phone-pad"
              />
              <TouchableOpacity onPress={addEmergencyContact} style={[styles.addButton, { backgroundColor: accent }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>+</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.cardTitle, { marginTop: 16 }]}>{t("Company Contacts")}</Text>

            {companyContacts.map((c, i) => (
              <View key={i} style={styles.contactRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactLabel}>{c.label}</Text>
                  <Text style={styles.contactPhone}>{c.phone}</Text>
                </View>
                <TouchableOpacity onPress={() => setCompanyContacts(prev => prev.filter((_, idx) => idx !== i))}>
                  <Text style={{ color: '#e53e3e', fontWeight: '600', fontSize: 13 }}>{t("Remove")}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <View style={styles.addContactRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t("Name")}
                placeholderTextColor={colors.textMuted}
                value={newCoLabel}
                onChangeText={setNewCoLabel}
              />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder={t("Phone")}
                placeholderTextColor={colors.textMuted}
                value={newCoPhone}
                onChangeText={setNewCoPhone}
                keyboardType="phone-pad"
              />
              <TouchableOpacity onPress={addCompanyContact} style={[styles.addButton, { backgroundColor: accent }]}>
                <Text style={{ color: "#fff", fontWeight: "700" }}>+</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: accent, marginTop: 12 }]}
              onPress={saveStandaloneContacts}
            >
              <Text style={styles.saveButtonText}>{t("Save Contacts")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t("Contacts")}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
              {t("Contacts are managed by your company in Dashboard Settings.")}
            </Text>
            {themeEmergencyContacts.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.label, { marginBottom: 4 }]}>{t("Emergency")}</Text>
                {themeEmergencyContacts.map((c, i) => (
                  <View key={i} style={styles.contactRow}>
                    <Text style={styles.contactLabel}>{c.label}</Text>
                    <Text style={styles.contactPhone}>{c.phone}</Text>
                  </View>
                ))}
              </View>
            )}
            {themeCompanyContacts.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.label, { marginBottom: 4 }]}>{t("Company")}</Text>
                {themeCompanyContacts.map((c, i) => (
                  <View key={i} style={styles.contactRow}>
                    <Text style={styles.contactLabel}>{c.label}</Text>
                    <Text style={styles.contactPhone}>{c.phone}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>{t("Sign Out")}</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SignatureModal
        visible={showSigModal}
        onClose={() => setShowSigModal(false)}
        onSave={(base64: string) => {
          console.log('[Settings] DIRECT onSave, length:', base64?.length);
          if (base64 && base64.length > 10) {
            const uri = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
            setSignatureImage(uri);
            // Fire-and-forget RTDB sync
            if (session?.passcodeHash) {
              fetch(`${FIREBASE_DB}/drivers/approved/${session.passcodeHash}/profile.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signature: base64 }),
              }).catch(() => {});
            }
          }
        }}
        accent={accent}
        title={t("Update Signature")}
      />
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
    gap: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 4,
  },
  field: {
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textDark,
    marginBottom: 4,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.textDark,
  },
  saveButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  signaturePreview: {
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  signatureImage: {
    width: "100%",
    height: 80,
    backgroundColor: "#fff",
  },
  langButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  langText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textDark,
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textDark,
  },
  contactPhone: {
    fontSize: 13,
    color: colors.textMuted,
  },
  addContactRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    alignItems: "center",
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e53e3e",
    alignItems: "center",
  },
  logoutText: {
    color: "#e53e3e",
    fontSize: 16,
    fontWeight: "700",
  },
});
