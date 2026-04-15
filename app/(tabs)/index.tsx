
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    AppState,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

import { WebView } from "react-native-webview";
import { buildJsaPdfHtml } from "../../services/jsaPdfHtml";
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
import { fetchDriverProfile } from "../../services/driverAuth";
import { useLanguage } from "../contexts/LanguageContext";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

export default function JsaHomeScreen() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const { accent, logoUrl, companyName: themeCompanyName, jobTypes } = useTheme();

  const [driverName, setDriverName] = useState(session?.legalName || session?.displayName || "");
  const [truckNumber, setTruckNumber] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [favoriteLocations, setFavoriteLocations] = useState<string[]>([]);
  const [jobActivityName, setJobActivityName] = useState("");
  const [pusher, setPusher] = useState("");
  const [wellName, setWellName] = useState("");
  const [addedWells, setAddedWells] = useState<{ name: string; operator: string; county: string; jobType?: string }[]>([]);
  const [wellSuggestions, setWellSuggestions] = useState<WellRecord[]>([]);
  const [wellDataLoading, setWellDataLoading] = useState(false);
  const [jobTypeSuggestions, setJobTypeSuggestions] = useState<string[]>([]);
  const [otherInfo, setOtherInfo] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  );
  const [continueJsa, setContinueJsa] = useState<any | null>(null);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const { t, toggleLang, lang, setLang } = useLanguage();

  // Driver's assigned operators — read from RTDB assignedCustomers (same as WB T)
  const [driverOperators, setDriverOperators] = useState<string[]>([]);

  // Track whether app was opened via deep link (SSO from WB S or WB T)
  const [deepLinked, setDeepLinked] = useState(false);

  // Multi-JSA: array of active JSAs for today
  type ActiveJsa = {
    id: string;
    label: string;           // first well name or job type — tab label
    signedAt: string;         // ISO timestamp
    pdfUrl?: string;
    savedData: any;           // full JSA record from submission
    wells: { name: string; operator: string; county: string; jobType?: string }[];
    locations: string[];
  };
  const [activeJsas, setActiveJsas] = useState<ActiveJsa[]>([]);
  const [activeJsaIndex, setActiveJsaIndex] = useState(0);

  // Derived: is there at least one active JSA?
  const jsaCompletedToday = activeJsas.length > 0;
  const currentJsa = activeJsas[activeJsaIndex] || null;

  // Legacy compat setters (used by fetchJsaDayStatus)
  const [jsaCompletedTime, setJsaCompletedTime] = useState<string | null>(null);
  const [jsaPdfUrl, setJsaPdfUrl] = useState<string | null>(null);

  // Living document — add well modal
  const [showAddWellModal, setShowAddWellModal] = useState(false);
  const [addWellName, setAddWellName] = useState("");
  const [addWellJobType, setAddWellJobType] = useState("");
  const [addWellSuggestions, setAddWellSuggestions] = useState<WellRecord[]>([]);

  // Auto-fill from deep link (jsaapp://start?driverName=...&wellName=...)
  useEffect(() => {
    // Check if we have a returnTo stored from a previous deep link (e.g. app was killed and resumed)
    AsyncStorage.getItem('jsa_returnTo').then(val => {
      if (val) setDeepLinked(true);
    }).catch(() => {});

    AsyncStorage.getItem('jsa_autofill').then(raw => {
      if (!raw) return;
      try {
        const params = JSON.parse(raw);
        if (params.driverName) setDriverName(params.driverName);
        if (params.truckNumber) setTruckNumber(params.truckNumber);
        if (params.wellName) {
          setWellName(params.wellName);
          setAddedWells([{
            name: params.wellName,
            operator: params.operator || '',
            county: '',
          }]);
        }
        if (params.jobType) {
          setJobActivityName(params.jobType);
        }
        if (params.date) setDate(params.date);
        if (params.disposal) setLocationInput(params.disposal);
        if (params.returnTo) {
          setDeepLinked(true);
          // Store return app for deep link back on completion
          AsyncStorage.setItem('jsa_returnTo', params.returnTo).catch(() => {});
        }
        // Clear after reading — one-time auto-fill
        AsyncStorage.removeItem('jsa_autofill').catch(() => {});
        console.log('[JSA] Auto-filled from deep link');
      } catch {}
    }).catch(() => {});
  }, []);

  // Reusable function to fetch jsa_day_status and update wells/locations
  const fetchJsaDayStatus = React.useCallback(async () => {
    if (!session?.passcodeHash) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const docId = `${session.passcodeHash}_${todayStr}`;
    const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents';
    const API_KEY = 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI';

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const resp = await fetch(
        `${FIRESTORE_BASE}/jsa_day_status/${docId}?key=${API_KEY}`,
        { signal: controller.signal },
      );
      clearTimeout(timer);
      if (!resp.ok) return;

      const doc = await resp.json();

      // Check completion status — if JSA signed in Firestore but no active JSAs loaded, hydrate from saved data
      if (doc.fields?.jsaCompleted?.booleanValue === true) {
        const completedAt = doc.fields?.jsaCompletedAt?.timestampValue || doc.fields?.jsaCompletedAt?.stringValue;
        if (completedAt) setJsaCompletedTime(completedAt);
        const pdfUrl = doc.fields?.pdfUrl?.stringValue || '';
        if (pdfUrl) setJsaPdfUrl(pdfUrl);

        // If no active JSAs in state, hydrate from AsyncStorage saves
        setActiveJsas(prev => {
          if (prev.length > 0) return prev; // already loaded
          // Load from saved JSAs
          (async () => {
            try {
              const stored = await AsyncStorage.getItem(STORAGE_KEYS.saves);
              if (!stored) return;
              const list = JSON.parse(stored);
              if (!Array.isArray(list) || list.length === 0) return;
              const latest = list[0];
              const wellsList = Array.isArray(latest.wells) ? latest.wells.map((w: any) =>
                typeof w === 'string' ? { name: w, operator: '', county: '' } : w
              ) : [];
              const jsaEntry: ActiveJsa = {
                id: latest.id || Date.now().toString(),
                label: wellsList[0]?.name || latest.jobActivityName || 'JSA',
                signedAt: completedAt || latest.timestamp || '',
                pdfUrl: pdfUrl,
                savedData: latest,
                wells: wellsList,
                locations: Array.isArray(latest.locations) ? latest.locations : [],
              };
              setActiveJsas([jsaEntry]);
            } catch {}
          })();
          return prev;
        });
      }

      // Merge wells/locations from Firestore into the current active JSA
      const allStamped = new Set<string>();

      // Wells written by JSA app on submit
      const wellValues = doc.fields?.wells?.arrayValue?.values;
      if (Array.isArray(wellValues)) {
        for (const v of wellValues) {
          const name = v?.mapValue?.fields?.name?.stringValue;
          if (name) allStamped.add(name);
        }
      }

      // Location stamps from WB T (pickup/dropoff)
      const locValues = doc.fields?.locations?.arrayValue?.values;
      if (Array.isArray(locValues)) {
        for (const v of locValues) {
          const name = v?.mapValue?.fields?.name?.stringValue;
          if (name) allStamped.add(name);
        }
      }

      // Add new stamps to the current active JSA's wells (or to form addedWells if no active JSA)
      if (allStamped.size > 0) {
        if (activeJsas.length > 0) {
          // Add to the most recent active JSA
          setActiveJsas(prev => {
            const idx = prev.length - 1; // latest JSA
            const current = prev[idx];
            const existingNames = new Set(current.wells.map(w => w.name.toUpperCase()));
            const newWells = [...allStamped]
              .filter(name => !existingNames.has(name.toUpperCase()) && /\d/.test(name))
              .map(name => ({ name, operator: '', county: '' }));
            if (newWells.length === 0) return prev;
            const updated = [...prev];
            updated[idx] = { ...current, wells: [...current.wells, ...newWells] };
            return updated;
          });
        } else {
          // No active JSA yet — add to form wells for pre-population
          setAddedWells(prev => {
            const existingNames = new Set(prev.map(w => w.name.toUpperCase()));
            const newWells = [...allStamped]
              .filter(name => !existingNames.has(name.toUpperCase()) && /\d/.test(name))
              .map(name => ({ name, operator: '', county: '' }));
            return newWells.length > 0 ? [...prev, ...newWells] : prev;
          });
          setAddedLocations(prev => {
            const existingLocs = new Set(prev.map(l => l.toUpperCase()));
            const newLocs = [...allStamped]
              .filter(name => !existingLocs.has(name.toUpperCase()) && !/\d/.test(name));
            return newLocs.length > 0 ? [...prev, ...newLocs] : prev;
          });
        }
      }
    } catch (err) {
      console.warn('[JSA] Failed to fetch jsa_day_status:', err);
    }
  }, [session?.passcodeHash]);

  // Pre-populate locations from jsa_day_status (jobs done before JSA)
  // If driver deferred JSA and worked jobs, those locations auto-appear here.
  useEffect(() => {
    fetchJsaDayStatus();
  }, [fetchJsaDayStatus]);

  // Auto-refresh jsa_day_status when app comes to foreground (picks up WB T stamps)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fetchJsaDayStatus();
        // Also check for new JSA submissions (direct from AsyncStorage, no Firestore delay)
        hydrateFromSaves();
      }
    });
    return () => sub.remove();
  }, [fetchJsaDayStatus]);

  // Check AsyncStorage saves for new JSA submissions and hydrate active JSAs
  const hydrateFromSaves = React.useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.saves);
      if (!stored) return;
      const list = JSON.parse(stored);
      if (!Array.isArray(list) || list.length === 0) return;
      const today = new Date().toISOString().slice(0, 10);

      // Find today's JSAs that aren't already in activeJsas
      const todaySaves = list.filter((j: any) => {
        const jDate = j.date || j.timestamp?.slice(0, 10) || '';
        return jDate === today || j.timestamp?.startsWith(today);
      });

      if (todaySaves.length === 0) return;

      setActiveJsas(prev => {
        const existingIds = new Set(prev.map(j => j.id));
        const newEntries: ActiveJsa[] = [];
        for (const save of todaySaves) {
          if (existingIds.has(save.id)) continue;
          const wellsList = Array.isArray(save.wells) ? save.wells.map((w: any) =>
            typeof w === 'string' ? { name: w, operator: '', county: '' } : w
          ) : [];
          newEntries.push({
            id: save.id,
            label: wellsList[0]?.name || save.jobActivityName || 'JSA',
            signedAt: save.timestamp || '',
            pdfUrl: '',
            savedData: save,
            wells: wellsList,
            locations: Array.isArray(save.locations) ? save.locations : [],
          });
        }
        if (newEntries.length === 0) return prev;
        // If we were in new-JSA mode (index -1), switch to the new one
        if (activeJsaIndex === -1) setActiveJsaIndex(prev.length + newEntries.length - 1);
        return [...prev, ...newEntries];
      });
    } catch {}
  }, [activeJsaIndex]);

  // Hydrate on mount too
  useEffect(() => { hydrateFromSaves(); }, []);

  // Load active JSAs from AsyncStorage on mount
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('@jsa/activeJsas');
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Only load if from today
          const today = new Date().toISOString().slice(0, 10);
          const todayJsas = parsed.filter((j: ActiveJsa) => j.signedAt?.startsWith(today));
          if (todayJsas.length > 0) {
            setActiveJsas(todayJsas);
            // Also set legacy compat values from first JSA
            setJsaCompletedTime(todayJsas[0].signedAt);
            setJsaPdfUrl(todayJsas[0].pdfUrl || null);
          }
        }
      } catch {}
    })();
  }, []);

  // Persist active JSAs to AsyncStorage whenever they change
  useEffect(() => {
    if (activeJsas.length > 0) {
      AsyncStorage.setItem('@jsa/activeJsas', JSON.stringify(activeJsas)).catch(() => {});
    } else {
      AsyncStorage.removeItem('@jsa/activeJsas').catch(() => {});
    }
  }, [activeJsas]);


  // Load NDIC well data — scoped by driver's assignedCustomers from RTDB.
  // Same approach as WB T: driver record has operator names, load only those wells.
  const { configLoaded } = useTheme();
  useEffect(() => {
    if (!configLoaded) return; // ThemeContext hasn't loaded yet
    if (!session) return;
    const loadWellData = async () => {
      setWellDataLoading(true);
      try {
        await loadOperators();
        await loadAliases();
        if (driverOperators.length > 0) {
          // Driver-scoped: load only their assigned operators' wells (~200-400)
          await preloadCompanyWells(driverOperators);
        } else {
          // No assigned operators — load all (WB admin or unconfigured driver)
          await loadAllWells();
        }
      } catch (err) {
        console.warn('[JSA] Failed to load NDIC well data:', err);
      } finally {
        setWellDataLoading(false);
      }
    };
    loadWellData();
  }, [driverOperators, configLoaded, session]);

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

  const [addedLocations, setAddedLocations] = useState<string[]>([]);

  const trimmedLocation = locationInput.trim();
  const hasWellOrLocation = addedWells.length > 0 || wellName.trim().length > 0 || addedLocations.length > 0 || trimmedLocation.length > 0;
  // Deep-linked (pre-shift from WB S): driver may not have a job yet, well/location optional
  // Form is hidden when JSA completed, so no need for jsaCompletedToday check here
  const isNextDisabled = !driverName.trim() || !truckNumber.trim() || (!hasWellOrLocation && !deepLinked);

  const handleJobTypeTextChange = (text: string) => {
    setJobActivityName(text);
    if (text.trim().length >= 1) {
      const lower = text.toLowerCase();
      setJobTypeSuggestions((jobTypes || []).filter(jt => jt.toLowerCase().includes(lower)));
    } else {
      setJobTypeSuggestions([]);
    }
  };

  const handleJobTypeSelect = (jt: string) => {
    setJobActivityName(jt);
    setJobTypeSuggestions([]);
  };

  const handleWellTextChange = (text: string) => {
    setWellName(text);
    if (text.trim().length >= 2) {
      const results = searchWells(text, 0);
      setWellSuggestions(results);
    } else {
      setWellSuggestions([]);
    }
  };

  const handleWellSelect = (well: WellRecord) => {
    const entry = { name: well.well_name, operator: well.operator, county: well.county, jobType: jobActivityName || '' };
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
      setAddedWells((prev) => [...prev, { name: trimmed, operator: '', county: '', jobType: jobActivityName || '' }]);
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
        const [storedDriver, storedTruck, ssoTruck] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.driverName),
          AsyncStorage.getItem(STORAGE_KEYS.truckNumber),
          AsyncStorage.getItem('@jsa/ssoTruck'),
        ]);

        // SSO truck takes priority
        if (ssoTruck) {
          setTruckNumber(ssoTruck);
          AsyncStorage.removeItem('@jsa/ssoTruck').catch(() => {}); // one-time
        } else if (storedTruck) {
          setTruckNumber(storedTruck);
        }
        // Driver name: use session legalName first, then stored
        if (!driverName && storedDriver) setDriverName(storedDriver);

        // Fetch fresh profile from RTDB — gets legalName, truck#, assignedCustomers
        // This fixes stale AsyncStorage values (e.g. "TabletS10" in truck# field)
        const profileData = await fetchDriverProfile();
        if (profileData) {
          // Update legalName if RTDB has it and current value is just displayName
          if (profileData.legalName) {
            const sessionDisplay = session?.displayName || '';
            // Only override if current driverName matches login displayName (stale)
            if (driverName === sessionDisplay || !driverName) {
              setDriverName(profileData.legalName);
            }
          }
          // Update truck# from RTDB if current value is empty or matches displayName (stale)
          if (profileData.truckNumber) {
            const currentTruck = ssoTruck || storedTruck || '';
            const sessionDisplay = session?.displayName || '';
            if (!currentTruck || currentTruck === sessionDisplay) {
              setTruckNumber(profileData.truckNumber);
            }
          }
          // Set assigned operators for company-scoped well loading
          if (profileData.assignedCustomers.length > 0) {
            setDriverOperators(profileData.assignedCustomers.map(c => c.name));
          }
        }
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
        wells: JSON.stringify(addedWells.map(w => ({
          name: w.name,
          operator: w.operator || '',
          county: w.county || '',
          jobType: w.jobType || jobActivityName,
          source: 'ndic',
        }))),
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
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => router.push("/settings" as any)}
            accessibilityLabel="Open settings"
          >
            <Text style={styles.menuIcon}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* JSA Active Banner + Tabs */}
        {jsaCompletedToday && (
          <>
            <View style={{ backgroundColor: '#166534', borderRadius: 12, padding: 16, marginBottom: activeJsas.length > 1 ? 0 : 16, borderBottomLeftRadius: activeJsas.length > 1 ? 0 : 12, borderBottomRightRadius: activeJsas.length > 1 ? 0 : 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(34,197,94,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 20 }}>✓</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{t("JSA Active")}</Text>
                  {currentJsa?.signedAt && (
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                      {t("Signed")} {new Date(currentJsa.signedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* JSA Tabs — only show when multiple JSAs */}
            {activeJsas.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 0 }}>
                  {activeJsas.map((jsa, i) => (
                    <TouchableOpacity
                      key={jsa.id}
                      onPress={() => setActiveJsaIndex(i)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        backgroundColor: i === activeJsaIndex ? '#fff' : '#e5e5e5',
                        borderBottomLeftRadius: 8,
                        borderBottomRightRadius: 8,
                        borderWidth: i === activeJsaIndex ? 0 : 0,
                        marginRight: 2,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: i === activeJsaIndex ? '700' : '500', color: i === activeJsaIndex ? '#111' : '#666' }}>
                        {jsa.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {/* + tab for new JSA */}
                  <TouchableOpacity
                    onPress={() => {
                      // Switch to form mode for new JSA
                      setAddedWells([]);
                      setAddedLocations([]);
                      setJobActivityName('');
                      setPusher('');
                      setWellName('');
                      setOtherInfo('');
                      setDate(new Date().toISOString().slice(0, 10));
                      // Temporarily hide active JSAs to show form
                      setActiveJsaIndex(-1);
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      backgroundColor: activeJsaIndex === -1 ? '#fff' : '#e5e5e5',
                      borderBottomLeftRadius: 8,
                      borderBottomRightRadius: 8,
                      marginLeft: 2,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '700', color: accent }}>+</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </>
        )}

        {/* Living JSA Dashboard — full paper JSA per tab */}
        {jsaCompletedToday && currentJsa && (
          <>
            {/* Full JSA Document — paper-ready WebView */}
            {currentJsa.savedData && (() => {
              const sd = currentJsa.savedData;
              let ppeItems: string[] = [];
              const rawPpe = sd.ppeSelected;
              if (typeof rawPpe === 'object' && !Array.isArray(rawPpe)) {
                ppeItems = Object.entries(rawPpe).filter(([, v]) => v).map(([k]) => k);
              } else if (typeof rawPpe === 'string') {
                try { const p = JSON.parse(rawPpe); if (p?.selected) ppeItems = Object.entries(p.selected).filter(([, v]) => v).map(([k]) => k); } catch {}
              }
              let preparedItems: string[] = [];
              const rawPrep = sd.prepared;
              if (typeof rawPrep === 'object') preparedItems = Object.entries(rawPrep).filter(([, v]) => v).map(([k]) => k);

              const jsaHtml = buildJsaPdfHtml({
                driverName: sd.driverName || '',
                truckNumber: sd.truckNumber || '',
                pusher: sd.pusher || '',
                wellName: currentJsa.wells.map((w: any) => w.name).join(', '),
                wells: currentJsa.wells,
                jobActivity: sd.jobActivityName || '',
                date: sd.date || '',
                notes: sd.notes || '',
                signature: sd.signature || '',
                signatureImage: sd.signatureImage || undefined,
                locations: currentJsa.locations || [],
                locationAcks: {},
                ppeItems,
                preparedItems,
                emergencyContacts: [],
                companyContacts: [],
                accent,
                logoDataUrl: null,
              });

              return (
                <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 12, height: 500 }}>
                  <WebView
                    key={'jsa-doc-' + currentJsa.id}
                    source={{ html: jsaHtml }}
                    style={{ flex: 1, backgroundColor: '#f5f5f5' }}
                    scrollEnabled={true}
                    scalesPageToFit={true}
                  />
                </View>
              );
            })()}

            {/* Add Well / Location + New JSA buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: accent, flex: 1, marginBottom: 0 }]}
                onPress={() => setShowAddWellModal(true)}
              >
                <Text style={styles.buttonText}>{t("+ Add Well")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: accent, flex: 1, marginBottom: 0 }]}
                onPress={() => {
                  setAddedWells([]);
                  setAddedLocations([]);
                  setJobActivityName('');
                  setPusher('');
                  setWellName('');
                  setOtherInfo('');
                  setDate(new Date().toISOString().slice(0, 10));
                  setActiveJsaIndex(-1); // show form
                }}
              >
                <Text style={[styles.buttonText, { color: accent }]}>{t("+ New JSA")}</Text>
              </TouchableOpacity>
            </View>

            {/* View / Regenerate PDF */}
            {jsaPdfUrl && (
              <TouchableOpacity
                style={[styles.button, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: accent, marginBottom: 12 }]}
                onPress={() => {
                  import('expo-linking').then(({ default: Linking }) => {
                    Linking.openURL(jsaPdfUrl!).catch(() => {});
                  });
                }}
              >
                <Text style={[styles.buttonText, { color: accent }]}>{t("View Current JSA PDF")}</Text>
              </TouchableOpacity>
            )}

            {/* Close & Save this JSA */}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dc2626', marginBottom: 16 }]}
              onPress={() => {
                Alert.alert(
                  t("Close JSA"),
                  t("This will finalize this JSA with all job sites visited. A final PDF will be saved."),
                  [
                    { text: t("Cancel"), style: "cancel" },
                    {
                      text: t("Close & Save"),
                      style: "destructive",
                      onPress: () => {
                        // Remove this JSA from active list
                        setActiveJsas(prev => {
                          const updated = prev.filter((_, i) => i !== activeJsaIndex);
                          return updated;
                        });
                        // Reset index to 0 (or -1 if none left)
                        setActiveJsaIndex(0);
                        // If no JSAs left, reset form
                        if (activeJsas.length <= 1) {
                          setJsaCompletedTime(null);
                          setJsaPdfUrl(null);
                          setAddedWells([]);
                          setAddedLocations([]);
                          setJobActivityName('');
                          setPusher('');
                          setWellName('');
                          setOtherInfo('');
                          setDate(new Date().toISOString().slice(0, 10));
                        }
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={[styles.buttonText, { color: '#dc2626' }]}>{t("Close & Save JSA")}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Card — hidden when JSA active (unless adding new via + tab) */}
        {(jsaCompletedToday && activeJsaIndex >= 0) ? null : (
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
              autoComplete="off"
              importantForAutofill="no"
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
              autoComplete="off"
              importantForAutofill="no"
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
              autoComplete="off"
              importantForAutofill="no"
            />
            <Text style={styles.helperText}>
              {t("Defaults to today. Edit if needed.")}
            </Text>
          </View>

          <View style={[styles.field, { zIndex: 30 }]}>
            <Text style={styles.label}>{t("Job Type")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Start typing a job type...")}
              placeholderTextColor={colors.textMuted}
              value={jobActivityName}
              onChangeText={handleJobTypeTextChange}
              returnKeyType="next"
              autoComplete="off"
              importantForAutofill="no"
            />
            {jobTypeSuggestions.length > 0 && (
              <View style={styles.autocompleteDropdown}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {jobTypeSuggestions.map((jt, index) => (
                    <TouchableOpacity
                      key={jt}
                      style={[styles.dropdownItem, index === jobTypeSuggestions.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => handleJobTypeSelect(jt)}
                    >
                      <Text style={styles.dropdownItemText}>{jt}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Well Name")}</Text>
            {wellDataLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={styles.loadingText}>{t("Loading NDIC wells...")}</Text>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder={wellDataLoading ? t("Loading wells...") : t("Search NDIC wells...")}
              placeholderTextColor={colors.textMuted}
              value={wellName}
              onChangeText={handleWellTextChange}
              returnKeyType="next"
              onSubmitEditing={addWellManual}
              autoComplete="off"
              importantForAutofill="no"
            />
            {wellSuggestions.length > 0 && (
              <View style={styles.wellSuggestionsContainer}>
                <ScrollView
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  style={styles.wellSuggestionsList}
                >
                  {wellSuggestions.map((well, index) => (
                    <TouchableOpacity
                      key={`${well.api_no}-${index}`}
                      style={[styles.dropdownItem, index === wellSuggestions.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => handleWellSelect(well)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.dropdownItemText}>{well.well_name}</Text>
                      <Text style={styles.dropdownItemSub}>{well.operator} • {well.county} Co.</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {wellName.trim().length >= 2 && wellSuggestions.length === 0 && !wellDataLoading && (
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
                        <Text style={styles.wellDetailText}>
                          {[well.operator, well.county ? `${well.county} Co.` : '', well.jobType].filter(Boolean).join(' • ')}
                        </Text>
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
              autoComplete="off"
              importantForAutofill="no"
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
            <Text style={styles.label}>{t("Pusher")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Pusher name")}
              placeholderTextColor={colors.textMuted}
              value={pusher}
              onChangeText={setPusher}
              returnKeyType="next"
              autoComplete="off"
              importantForAutofill="no"
            />
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
            autoComplete="off"
            importantForAutofill="no"
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
                  {deepLinked
                    ? t("Fill in driver and truck # to continue.")
                    : t("Fill in driver, truck #, and a well or location to continue.")}
                </Text>
              )}
            </>
          )}
        </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Add Well / Location Modal — living document */}
      <Modal visible={showAddWellModal} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textDark, marginBottom: 12 }}>{t("Add Well / Location")}</Text>

            <Text style={styles.label}>{t("Well or Location Name")}</Text>
            <TextInput
              style={styles.input}
              placeholder={t("Search NDIC wells or enter manually...")}
              placeholderTextColor={colors.textMuted}
              value={addWellName}
              onChangeText={(text) => {
                setAddWellName(text);
                if (text.length >= 2) {
                  setAddWellSuggestions(searchWells(text, 10));
                } else {
                  setAddWellSuggestions([]);
                }
              }}
              autoComplete="off"
            />

            {/* NDIC suggestions */}
            {addWellSuggestions.length > 0 && (
              <ScrollView style={{ maxHeight: 120, marginTop: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }} nestedScrollEnabled>
                {addWellSuggestions.slice(0, 10).map((w, i) => (
                  <TouchableOpacity
                    key={i}
                    style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}
                    onPress={() => {
                      setAddWellName(w.well_name);
                      setAddWellSuggestions([]);
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '500' }}>{w.well_name}</Text>
                    <Text style={{ fontSize: 11, color: '#888' }}>{w.operator} • {w.county} Co.</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={{ marginTop: 12 }}>
              <Text style={styles.label}>{t("Job Type")}</Text>
              <TextInput
                style={styles.input}
                placeholder={t("e.g. Production Water, Service Work...")}
                placeholderTextColor={colors.textMuted}
                value={addWellJobType}
                onChangeText={setAddWellJobType}
                autoComplete="off"
              />
            </View>

            {/* Quick hazard confirm */}
            <View style={{ marginTop: 16, backgroundColor: '#fffbeb', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#fbbf24' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#92400e', marginBottom: 4 }}>{t("Hazard Review")}</Text>
              <Text style={{ fontSize: 12, color: '#78350f', lineHeight: 18 }}>
                {t("By adding this location, I confirm that I have reviewed the hazards and controls for this job site.")}
              </Text>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' }}
                onPress={() => {
                  setShowAddWellModal(false);
                  setAddWellName('');
                  setAddWellJobType('');
                  setAddWellSuggestions([]);
                }}
              >
                <Text style={{ color: colors.textDark, fontWeight: '600' }}>{t("Cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: accent, alignItems: 'center', opacity: addWellName.trim() ? 1 : 0.5 }}
                disabled={!addWellName.trim()}
                onPress={() => {
                  const name = addWellName.trim();
                  if (!name) return;
                  const newWell = { name, operator: '', county: '', jobType: addWellJobType.trim() || jobActivityName };
                  if (currentJsa) {
                    // Add to current active JSA
                    if (!currentJsa.wells.some((w: any) => w.name.toLowerCase() === name.toLowerCase())) {
                      setActiveJsas(prev => {
                        const updated = [...prev];
                        updated[activeJsaIndex] = {
                          ...updated[activeJsaIndex],
                          wells: [...updated[activeJsaIndex].wells, newWell],
                        };
                        return updated;
                      });
                    }
                  } else {
                    // Add to form (pre-JSA)
                    if (!addedWells.some(w => w.name.toLowerCase() === name.toLowerCase())) {
                      setAddedWells(prev => [...prev, newWell]);
                    }
                  }
                  setShowAddWellModal(false);
                  setAddWellName('');
                  setAddWellJobType('');
                  setAddWellSuggestions([]);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t("Add & Confirm Hazards")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  wellSuggestionsContainer: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    marginBottom: 4,
    maxHeight: 200,
    overflow: "hidden",
  },
  wellSuggestionsList: {
    maxHeight: 200,
  },
});
