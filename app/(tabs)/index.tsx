
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";

import { colors } from "../../constants/colors";
import { STORAGE_KEYS } from "../../constants/storageKeys";
import {
  loadAllWells,
  loadOperators,
  loadAliases,
  searchWells,
  preloadCompanyWells,
  WellRecord,
} from "../../services/wellData";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function JsaHomeScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { accent, logoUrl, companyName: themeCompanyName } = useTheme();

  const [driverName, setDriverName] = useState(session?.displayName || "");
  const [truckNumber, setTruckNumber] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [favoriteLocations, setFavoriteLocations] = useState<string[]>([]);
  const [jobActivityName, setJobActivityName] = useState("");
  const [pusher, setPusher] = useState("");
  const [wellName, setWellName] = useState("");
  const [addedWells, setAddedWells] = useState<{ name: string; operator: string; county: string }[]>([]);
  const [wellSuggestions, setWellSuggestions] = useState<WellRecord[]>([]);
  const [wellDataLoading, setWellDataLoading] = useState(false);
  const [otherInfo, setOtherInfo] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  );
  const [continueJsa, setContinueJsa] = useState<any | null>(null);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const { t, toggleLang, lang, setLang } = useLanguage();

  const { assignedOperators } = useTheme();

  // Load NDIC well data on mount — company-scoped if operators assigned
  useEffect(() => {
    const loadWellData = async () => {
      setWellDataLoading(true);
      try {
        await loadOperators();
        await loadAliases();
        if (assignedOperators.length > 0) {
          // Company-scoped: load only assigned operators' wells (~200-400)
          await preloadCompanyWells(assignedOperators);
        } else {
          // No assigned operators (WB admin or unconfigured) — load all
          await loadAllWells();
        }
      } catch (err) {
        console.warn('[JSA] Failed to load NDIC well data:', err);
      } finally {
        setWellDataLoading(false);
      }
    };
    loadWellData();
  }, [assignedOperators]);

  const scrollViewRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  // Track keyboard visibility to add extra padding when open
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const trimmedLocation = locationInput.trim();
  const isNextDisabled = !driverName.trim() || !truckNumber.trim();

  const [addedLocations, setAddedLocations] = useState<string[]>([]);

  const handleWellTextChange = (text: string) => {
    setWellName(text);
    if (text.trim().length >= 3) {
      const results = searchWells(text);
      setWellSuggestions(results);
    } else {
      setWellSuggestions([]);
    }
  };

  const handleWellSelect = (well: WellRecord) => {
    const entry = { name: well.well_name, operator: well.operator, county: well.county };
    if (!addedWells.some(w => w.name === well.well_name && w.operator === well.operator)) {
      setAddedWells((prev) => [...prev, entry]);
    }
    setWellName("");
    setWellSuggestions([]);
  };

  const addWellManual = () => {
    const trimmed = wellName.trim();
    if (!trimmed) return;
    if (!addedWells.some(w => w.name.toLowerCase() === trimmed.toLowerCase())) {
      setAddedWells((prev) => [...prev, { name: trimmed, operator: '', county: '' }]);
    }
    setWellName("");
    setWellSuggestions([]);
  };

  const removeWellFromList = (name: string) => {
    setAddedWells((prev) => prev.filter((item) => item.name !== name));
  };

  const addLocationToList = (loc: string) => {
    const trimmed = loc.trim();
    if (!trimmed) return;
    if (!addedLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      setAddedLocations((prev) => [...prev, trimmed]);
    }
    // Also save as favorite if not already
    if (!favoriteLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      setFavoriteLocations((prev) => [...prev, trimmed]);
    }
    setLocationInput("");
  };

  const removeLocationFromList = (loc: string) => {
    setAddedLocations((prev) => prev.filter((item) => item !== loc));
  };

  // Load location favorites on mount
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const storedLocations = await AsyncStorage.getItem(STORAGE_KEYS.favoriteLocations);
        if (storedLocations) {
          const parsedLocs = JSON.parse(storedLocations);
          if (Array.isArray(parsedLocs)) {
            setFavoriteLocations(parsedLocs.filter((item) => typeof item === "string"));
          }
        }
      } catch (error) {
        console.warn("Failed to load favorites", error);
      } finally {
        setFavoritesLoaded(true);
      }
    };
    loadFavorites();
  }, []);

  // Save location favorites after initial load
  useEffect(() => {
    if (!favoritesLoaded) return;
    AsyncStorage.setItem(STORAGE_KEYS.favoriteLocations, JSON.stringify(favoriteLocations)).catch((error) =>
      console.warn("Failed to save favorite locations", error)
    );
  }, [favoriteLocations, favoritesLoaded]);

  useEffect(() => {
    const loadDriverAndTruck = async () => {
      try {
        const [storedDriver, storedTruck] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.driverName),
          AsyncStorage.getItem(STORAGE_KEYS.truckNumber),
        ]);
        if (storedDriver) setDriverName(storedDriver);
        if (storedTruck) setTruckNumber(storedTruck);
      } catch (error) {
        console.warn("Failed to load saved driver/truck", error);
      }
    };
    loadDriverAndTruck();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.driverName, driverName).catch((error) =>
      console.warn("Failed to save driver name", error)
    );
  }, [driverName]);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEYS.truckNumber, truckNumber).catch((error) =>
      console.warn("Failed to save truck number", error)
    );
  }, [truckNumber]);

  useEffect(() => {
    const maybeLoadExisting = async () => {
      const name = driverName.trim();
      const truck = truckNumber.trim();
      if (!name || !truck) {
        setContinueJsa(null);
        return;
      }
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.saves);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const today = new Date().toISOString().slice(0, 10);
            const matches = parsed.filter(
              (item) =>
                (item.driverName || "").trim() === name &&
                (item.truckNumber || "").trim() === truck &&
                item.date === today &&
                !item.signature
            );
            if (matches.length) {
              const latest = matches.sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              )[0];
              setContinueJsa(latest);
            } else {
              setContinueJsa(null);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to check existing JSA", error);
        setContinueJsa(null);
      }
    };
    maybeLoadExisting();
  }, [driverName, truckNumber]);

  const handleNext = () => {
    if (isNextDisabled) return;

    router.push({
      pathname: "/steps",
      params: {
        driverName,
        truckNumber,
        jobActivityName,
        pusher,
        wellName: addedWells[0]?.name || wellName,
        wells: JSON.stringify(addedWells.map(w => w.name)),
        otherInfo,
        location: addedLocations[0] || locationInput.trim(),
        locations: JSON.stringify(addedLocations),
        date,
        jsaSessionId: Date.now().toString(),
      },
    });
  };

  const handleNewJsa = () => {
    setAddedWells([]);
    setAddedLocations([]);
    setLocationInput("");
    setDate(new Date().toISOString().slice(0, 10));
    setContinueJsa(null);
    setJobActivityName("");
    setPusher("");
    setWellName("");
    setOtherInfo("");
  };

  const handleContinue = () => {
    if (!continueJsa) return;
    router.push({
      pathname: "/openJsas",
      params: {
        driverName: continueJsa.driverName || driverName,
        truckNumber: continueJsa.truckNumber || truckNumber,
        date: new Date().toISOString().slice(0, 10),
      },
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardVisible && { paddingBottom: 250 }
          ]}
          keyboardShouldPersistTaps="handled"
        >
        {/* Header with logo */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={styles.logo}
                resizeMode="contain"
              />
            ) : (
              <Image
                source={require("../../assets/images/company-logo-transparent.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            )}
            <View style={styles.headerTextWrapper}>
              <Text style={styles.companyName}>{t("Job Safety Analysis")}</Text>
              <Text style={styles.subtitle}>{themeCompanyName} • {t("Digital JSA")}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() =>
                Alert.alert(t("Settings"), t("Choose language"), [
                  { text: "English", onPress: () => setLang("en"), style: lang === "en" ? "destructive" : "default" },
                  { text: "Español", onPress: () => setLang("es"), style: lang === "es" ? "destructive" : "default" },
                  { text: t("Cancel"), style: "cancel" },
                ])
              }
              accessibilityLabel="Open settings"
            >
              <Text style={styles.menuIcon}>≡</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() =>
                Alert.alert("Sign Out", "Are you sure you want to sign out?", [
                  { text: t("Cancel"), style: "cancel" },
                  { text: "Sign Out", style: "destructive", onPress: logout },
                ])
              }
              accessibilityLabel="Sign out"
            >
              <Text style={[styles.menuIcon, { fontSize: 16, color: colors.textMuted }]}>⏻</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("Job Details")}</Text>
          <Text style={styles.cardSubtitle}>
            {t("Fill out the basic info for this job.")}
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Driver Name")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Enter driver name")}
              placeholderTextColor={colors.textMuted}
              value={driverName}
              onChangeText={setDriverName}
              returnKeyType="next"
                                        />
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
              returnKeyType="next"
                                        />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Date")}</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={date}
              onChangeText={setDate}
              returnKeyType="next"
                                        />
            <Text style={styles.helperText}>
              {t("Defaults to today. Edit if needed.")}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Job/Activity Name")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Job or activity")}
              placeholderTextColor={colors.textMuted}
              value={jobActivityName}
              onChangeText={setJobActivityName}
              returnKeyType="next"
                                        />
            <View style={[styles.segment, { marginTop: 8 }]}>
              <TouchableWithoutFeedback onPress={() => setJobActivityName("Loading")}>
                <View
                  style={[
                    styles.segmentItem,
                    jobActivityName === "Loading" && [styles.segmentItemActive, { backgroundColor: accent }],
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      jobActivityName === "Loading" && styles.segmentTextActive,
                    ]}
                  >
                    {t("Loading")}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
              <TouchableWithoutFeedback onPress={() => setJobActivityName("Unloading")}>
                <View
                  style={[
                    styles.segmentItem,
                    styles.segmentItemRight,
                    jobActivityName === "Unloading" && [styles.segmentItemActive, { backgroundColor: accent }],
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      jobActivityName === "Unloading" && styles.segmentTextActive,
                    ]}
                  >
                    {t("Unloading")}
                  </Text>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Pusher")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Pusher name")}
              placeholderTextColor={colors.textMuted}
              value={pusher}
              onChangeText={setPusher}
              returnKeyType="next"
            />
          </View>

          <View style={[styles.field, { zIndex: 20 }]}>
            <Text style={styles.label}>{t("Well Name")}</Text>
            {wellDataLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={styles.loadingText}>{t("Loading NDIC wells...")}</Text>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder={wellDataLoading ? t("Loading wells...") : t("Search NDIC wells (3+ chars)...")}
              placeholderTextColor={colors.textMuted}
              value={wellName}
              onChangeText={handleWellTextChange}
              returnKeyType="next"
              onSubmitEditing={addWellManual}
            />
            {wellSuggestions.length > 0 && (
              <View style={styles.autocompleteDropdown}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {wellSuggestions.map((well, index) => (
                    <TouchableOpacity
                      key={`${well.api_no}-${index}`}
                      style={[styles.dropdownItem, index === wellSuggestions.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => handleWellSelect(well)}
                    >
                      <Text style={styles.dropdownItemText}>{well.well_name}</Text>
                      <Text style={styles.dropdownItemSub}>{well.operator} • {well.county} Co.</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {wellName.trim().length >= 3 && wellSuggestions.length === 0 && !wellDataLoading && (
              <TouchableOpacity
                style={styles.saveInlineButton}
                onPress={addWellManual}
              >
                <Text style={styles.saveInlineText}>+ {t("Add")} "{wellName.trim()}" {t("manually")}</Text>
              </TouchableOpacity>
            )}
            {addedWells.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>{t("Added Wells")}</Text>
                <View style={[styles.favoriteList, { marginTop: 6 }]}>
                  {addedWells.map((well) => (
                    <TouchableOpacity
                      key={well.name}
                      style={styles.favoriteRow}
                      onPress={() => removeWellFromList(well.name)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.favoriteText}>{well.name}</Text>
                        {well.operator ? (
                          <Text style={styles.wellDetailText}>{well.operator} • {well.county} Co.</Text>
                        ) : null}
                      </View>
                      <Text style={styles.favoriteAdd}>{t("Remove")}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={[styles.field, { zIndex: 10 }]}>
            <Text style={styles.label}>{t("Lease / Pad Name")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("e.g. Kraken Epping Pad (optional)")}
              placeholderTextColor={colors.textMuted}
              value={locationInput}
              onChangeText={setLocationInput}
              returnKeyType="next"
              onBlur={() => {
                if (locationInput.trim()) {
                  addLocationToList(locationInput);
                }
              }}
            />
            {(() => {
              const trimmed = locationInput.trim().toLowerCase();
              const matches = trimmed
                ? favoriteLocations.filter((f) => f.toLowerCase().includes(trimmed) && f.toLowerCase() !== trimmed)
                : [];
              return matches.length > 0 ? (
                <View style={styles.autocompleteDropdown}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {matches.map((fav, index) => (
                      <TouchableOpacity
                        key={fav}
                        style={[styles.dropdownItem, index === matches.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => addLocationToList(fav)}
                        onLongPress={() => {
                          Alert.alert(
                            t("Remove Favorite"),
                            `${t("Remove")} "${fav}"?`,
                            [
                              { text: t("Cancel"), style: "cancel" },
                              {
                                text: t("Remove"),
                                style: "destructive",
                                onPress: () => setFavoriteLocations((prev) => prev.filter((l) => l !== fav)),
                              },
                            ]
                          );
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{fav}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null;
            })()}
            {locationInput.trim() && !favoriteLocations.some(l => l.toLowerCase() === locationInput.trim().toLowerCase()) && (
              <TouchableOpacity
                style={styles.saveInlineButton}
                onPress={() => {
                  const trimmed = locationInput.trim();
                  if (trimmed && !favoriteLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
                    setFavoriteLocations((prev) => [...prev, trimmed]);
                  }
                }}
              >
                <Text style={styles.saveInlineText}>★ {t("Save Favorite")}</Text>
              </TouchableOpacity>
            )}
            {addedLocations.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>{t("Added Locations")}</Text>
                <View style={[styles.favoriteList, { marginTop: 6 }]}>
                  {addedLocations.map((loc) => (
                    <TouchableOpacity
                      key={loc}
                      style={styles.favoriteRow}
                      onPress={() => removeLocationFromList(loc)}
                    >
                      <Text style={styles.favoriteText}>{loc}</Text>
                      <Text style={styles.favoriteAdd}>{t("Remove")}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("Other Information")}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder={t("Notes or other info")}
            placeholderTextColor={colors.textMuted}
            value={otherInfo}
            onChangeText={setOtherInfo}
            multiline
                                  />
        </View>

          {continueJsa ? (
            <>
              <View style={styles.incompleteJsaCard}>
                <Text style={styles.incompleteJsaTitle}>
                  {t("You have an incomplete JSA from today")}
                </Text>
                <Text style={styles.incompleteJsaDetails}>
                  {continueJsa.driverName} • {continueJsa.truckNumber}
                  {continueJsa.location ? ` • ${continueJsa.location}` : ""}
                </Text>
                <View style={styles.incompleteJsaButtons}>
                  <TouchableOpacity
                    style={[styles.button, { backgroundColor: accent }]}
                    onPress={handleContinue}
                  >
                    <Text style={styles.buttonText}>
                      {t("Pick Up Where I Left Off")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.secondaryButtonMain]}
                    onPress={handleNewJsa}
                  >
                    <Text style={[styles.buttonText, styles.secondaryButtonTextMain]}>
                      {t("Discard & Start New")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.button,
                  { backgroundColor: accent },
                  isNextDisabled && styles.buttonDisabled,
                ]}
                onPress={handleNext}
                disabled={isNextDisabled}
              >
                <Text style={styles.buttonText}>{t("Next: Steps & Hazards")}</Text>
              </TouchableOpacity>

              {isNextDisabled && (
                <Text style={styles.warningText}>
                  {t("Fill in driver and truck # to continue.")}
                </Text>
              )}
            </>
          )}
        </View>
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  logo: {
    width: 72,
    height: 72,
    marginRight: 12,
  },
  headerTextWrapper: {
    flex: 1,
  },
  companyName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textDark,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textDark,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
  },
  field: {
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.textDark,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: "#FFFFFF",
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: "top",
    paddingTop: 8,
    paddingBottom: 8,
  },
  helperText: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 4,
  },
  helperTextInline: {
    marginTop: 0,
    marginLeft: 8,
  },
  addLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: "#FFF7DF",
  },
  secondaryButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: "#F1F1F1",
  },
  secondaryButtonText: {
    color: colors.primaryDark,
    fontWeight: "600",
    fontSize: 13,
  },
  secondaryButtonTextDisabled: {
    color: colors.textMuted,
  },
  secondaryButtonMain: {
    marginTop: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonTextMain: {
    color: colors.primaryDark,
  },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: colors.card,
  },
  segmentItemRight: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  segmentItemActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  segmentTextActive: {
    color: "#FFFFFF",
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
  },
  buttonDisabled: {
    backgroundColor: "#E0C777",
  },
  buttonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 15,
    textAlign: "center",
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    color: "#B00020",
  },
  menuButton: {
    padding: 8,
    borderRadius: 8,
  },
  menuIcon: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textDark,
    lineHeight: 22,
  },
  favoriteList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#FFF",
  },
  favoriteRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  favoriteText: {
    fontSize: 14,
    color: colors.textDark,
    flex: 1,
  },
  favoriteAdd: {
    color: colors.primaryDark,
    fontWeight: "700",
    marginLeft: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 8,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 13,
  },
  incompleteJsaCard: {
    backgroundColor: "#FFF7E6",
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 8,
  },
  incompleteJsaTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 6,
  },
  incompleteJsaDetails: {
    fontSize: 14,
    color: colors.textMuted,
    marginBottom: 12,
  },
  incompleteJsaButtons: {
    gap: 10,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  inputWithDropdown: {
    position: "relative",
    zIndex: 10,
  },
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 100,
  },
  saveInlineButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#FFF7DF",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  saveInlineText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primaryDark,
  },
  dropdownList: {
    marginTop: 8,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    maxHeight: 150,
  },
  autocompleteDropdown: {
    position: "absolute",
    top: 68,
    left: 0,
    right: 0,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    maxHeight: 150,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
    zIndex: 100,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dropdownItemText: {
    fontSize: 14,
    color: colors.textDark,
  },
  dropdownItemSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  wellDetailText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  loadingText: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 6,
  },
});
