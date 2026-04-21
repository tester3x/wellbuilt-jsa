
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    AppState,
    Dimensions,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { WebView } from "react-native-webview";
import { buildJsaPdfHtml } from "../../services/jsaPdfHtml";
import { colors } from "../../constants/colors";
import { STORAGE_KEYS } from "../../constants/storageKeys";
import {
  loadOperators,
  loadAliases,
  searchWells,
  preloadCompanyWells,
  WellRecord,
} from "../../services/wellData";
import { fetchDriverProfile } from "../../services/driverAuth";
import { resolveActivity } from "../../components/jsa/locationActivity";
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
  const dismissedIdsRef = useRef<Set<string>>(new Set());
  const [hydrationDone, setHydrationDone] = useState(false);
  const autofillConsumedRef = useRef(false);

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

  // Debug: tracks which hydration path (if any) populated the form state.
  // Updated whenever any source mutates addedWells / addedLocations / form values.
  // Surfaced in the debug panel so field test can prove where rehydrated data
  // is coming from.
  const [hydrationSource, setHydrationSource] = useState<string>('none');
  // Once-per-session NO_ACTIVITY warning — avoid log spam.
  const noActivityLoggedRef = useRef(false);

  // Auto-fill from deep link (jsaapp://start?driverName=...&wellName=...).
  // Waits for hydrateAllJsas so we can decide whether to populate the new form
  // or focus an existing tab for today. Consumed exactly once per mount.
  useEffect(() => {
    // Carry-over returnTo (set if app was killed & resumed mid-flow)
    AsyncStorage.getItem('jsa_returnTo').then(val => {
      if (val) setDeepLinked(true);
    }).catch(() => {});

    if (!hydrationDone || autofillConsumedRef.current) return;
    autofillConsumedRef.current = true;

    // Resume-unfinished-JSA bridge: if the modal stashed a target date+wells,
    // pre-fill the new form for that date. Takes priority over regular autofill.
    AsyncStorage.getItem('jsa_resume').then(raw => {
      if (!raw) return;
      try {
        const { date, wellNames } = JSON.parse(raw);
        if (date) setDate(date);
        if (Array.isArray(wellNames) && wellNames.length > 0) {
          setAddedWells(wellNames.map((name: string) => ({ name, operator: '', county: '' })));
          setHydrationSource('resume');
        }
        setActiveJsaIndex(-1); // new form, not an existing tab
        console.log('[JSA] Resumed unfinished JSA for', date, '—', wellNames?.length, 'wells');
      } catch {}
      AsyncStorage.removeItem('jsa_resume').catch(() => {});
    }).catch(() => {});

    AsyncStorage.getItem('jsa_autofill').then(raw => {
      if (!raw) return;
      try {
        const params = JSON.parse(raw);

        // Metadata always applies (driver identity, return target)
        if (params.driverName && !isTruckPolluted(params.driverName)) setDriverName(params.driverName);
        // Truck # guard: reject any upstream value equal to login display/legal name.
        if (params.truckNumber && !isTruckPolluted(params.truckNumber)) setTruckNumber(params.truckNumber);
        if (params.date) setDate(params.date);
        if (params.disposal) setLocationInput(params.disposal);
        if (params.returnTo) {
          setDeepLinked(true);
          AsyncStorage.setItem('jsa_returnTo', String(params.returnTo)).catch(() => {});
        }

        // Well/jobType routing: if a today's JSA tab already exists, focus it
        // and append the well to its list (deduped). Otherwise populate the new
        // form the old way.
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayTabIdx = activeJsas.findIndex(j => (j.signedAt || '').startsWith(todayStr));
        if (todayTabIdx >= 0) {
          setActiveJsaIndex(todayTabIdx);
          if (params.wellName) {
            setActiveJsas(prev => {
              const target = prev[todayTabIdx];
              if (!target) return prev;
              const already = target.wells.some(
                w => w.name.trim().toUpperCase() === String(params.wellName).trim().toUpperCase(),
              );
              if (already) return prev;
              const updated = [...prev];
              updated[todayTabIdx] = {
                ...target,
                wells: [
                  ...target.wells,
                  {
                    name: params.wellName,
                    operator: params.operator || '',
                    county: '',
                    jobType: params.jobType || '',
                  },
                ],
              };
              return updated;
            });
          }
        } else {
          if (params.wellName) {
            setWellName(params.wellName);
            setAddedWells([{
              name: params.wellName,
              operator: params.operator || '',
              county: '',
              jobType: params.jobType || '',
            }]);
            setHydrationSource('deep_link');
          }
          if (params.jobType) setJobActivityName(params.jobType);
        }

        AsyncStorage.removeItem('jsa_autofill').catch(() => {});
        console.log('[JSA] Auto-filled from deep link — todayTabIdx:', todayTabIdx);
      } catch {}
    }).catch(() => {});
  }, [hydrationDone, activeJsas]);

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
      const jsaCompletedToday = doc.fields?.jsaCompleted?.booleanValue === true;

      // Check completion status — if JSA signed in Firestore but no active JSAs loaded, hydrate from saved data
      if (jsaCompletedToday) {
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
              // Respect dismissedIds — signed + dismissed JSAs must not return as active.
              let dismissedIds: Set<string> = dismissedIdsRef.current ?? new Set();
              if (dismissedIds.size === 0) {
                try {
                  const dismissedRaw = await AsyncStorage.getItem('@jsa/dismissedIds');
                  if (dismissedRaw) {
                    const parsed = JSON.parse(dismissedRaw);
                    if (Array.isArray(parsed)) dismissedIds = new Set(parsed);
                  }
                } catch {}
              }
              if (latest?.id && dismissedIds.has(latest.id)) return;
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

      // Add new stamps to the current active JSA's wells (or to form addedWells if no active JSA).
      // CRITICAL: if today's JSA is already completed in Firestore, DO NOT seed
      // the home form with the stamped wells. The driver submitted, possibly
      // removed wells manually, and expects a clean new form. Rehydrating
      // deleted wells back into the form is exactly the regression that sent
      // us here. Stamped wells still get merged into an existing active JSA
      // (paper-doc display), just not into the fresh form.
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
        } else if (!jsaCompletedToday) {
          // No active JSA AND today's JSA is not yet submitted → safe to
          // pre-populate the form with stamped wells (the "deferred JSA"
          // flow — driver worked jobs first, completes JSA later).
          setHydrationSource('stamped_wells');
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
        } else {
          console.log('[JSA][rehydrate skipped] jsaCompleted=true today — not seeding form with stamped wells');
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
        hydrateAllJsas();
      }
    });
    return () => sub.remove();
  }, [fetchJsaDayStatus, hydrateAllJsas]);

  // Unified JSA hydration — loads persisted tabs + merges new saves
  const hydrateAllJsas = React.useCallback(async () => {
    try {
      // Load dismissed IDs
      const dismissedRaw = await AsyncStorage.getItem('@jsa/dismissedIds');
      if (dismissedRaw) {
        try {
          const parsed = JSON.parse(dismissedRaw);
          if (Array.isArray(parsed)) parsed.forEach((id: string) => dismissedIdsRef.current.add(id));
        } catch {}
      }

      // 1. Load persisted active JSA tabs
      let existing: ActiveJsa[] = [];
      const persistedRaw = await AsyncStorage.getItem('@jsa/activeJsas');
      if (persistedRaw) {
        const parsed = JSON.parse(persistedRaw);
        if (Array.isArray(parsed)) existing = parsed;
      }

      // 2. Load saves and merge any new ones (skip dismissed)
      const savesRaw = await AsyncStorage.getItem(STORAGE_KEYS.saves);
      const saves = savesRaw ? JSON.parse(savesRaw) : [];
      if (Array.isArray(saves)) {
        const existingIds = new Set(existing.map(j => j.id));
        for (const save of saves) {
          if (existingIds.has(save.id)) continue;
          if (dismissedIdsRef.current.has(save.id)) continue;
          const wellsList = Array.isArray(save.wells) ? save.wells.map((w: any) =>
            typeof w === 'string' ? { name: w, operator: '', county: '' } : w
          ) : [];
          existing.push({
            id: save.id,
            label: wellsList[0]?.name || save.jobActivityName || 'JSA',
            signedAt: save.timestamp || '',
            pdfUrl: '',
            savedData: save,
            wells: wellsList,
            locations: Array.isArray(save.locations) ? save.locations : [],
          });
        }
      }

      if (existing.length > 0) {
        setActiveJsas(existing);
        setJsaCompletedTime(existing[0].signedAt);
        setJsaPdfUrl(existing[0].pdfUrl || null);
        // If we were in new-JSA mode, switch to the newest
        if (activeJsaIndex === -1) setActiveJsaIndex(existing.length - 1);
      }
    } catch {}
    // Signal to the autofill effect that it can safely decide where to route
    // the deep-link params (existing tab vs new form).
    setHydrationDone(true);
  }, [activeJsaIndex]);

  // Hydrate on mount AND when screen gains focus (e.g. returning from submit)
  useFocusEffect(
    useCallback(() => { hydrateAllJsas(); }, [hydrateAllJsas])
  );

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
        }
        // No operators assigned: skip loading entirely. Driver types well names
        // manually or picks oil companies in Settings. Loading 19k wells is a
        // 3–4 minute wait and unacceptable UX.
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

  // Refs for keyboard Next tab order across the Job Details form.
  // Chain: driverName → truckNumber → date → jobActivityName → wellName → pusher → otherInfo (last).
  const driverNameRef = useRef<TextInput>(null);
  const truckNumberRef = useRef<TextInput>(null);
  const dateRef = useRef<TextInput>(null);
  const jobActivityRef = useRef<TextInput>(null);
  const wellNameRef = useRef<TextInput>(null);
  const pusherRef = useRef<TextInput>(null);
  const otherInfoRef = useRef<TextInput>(null);

  // Controls visibility of Well/Location autocomplete dropdowns.
  // Dropdowns render only while the Well / Location TextInput has focus,
  // so they close on blur, on tap into another field, on Next, and on select.
  const [wellFieldFocused, setWellFieldFocused] = useState(false);

  // Truck # pollution guard: any value equal to the driver's login
  // displayName (or legalName) is treated as corruption. This covers every
  // upstream source — SSO deep link, AsyncStorage, RTDB profile, autofill —
  // because the device login identifier has leaked into truck fields in
  // prior builds (Mike TabletS10 scenario).
  const isTruckPolluted = useCallback((v: unknown): boolean => {
    if (!v || typeof v !== 'string') return false;
    const t = v.trim();
    if (!t) return false;
    const d = (session?.displayName || '').trim();
    const l = (session?.legalName || '').trim();
    if (d && t === d) return true;
    if (l && t === l) return true;
    return false;
  }, [session?.displayName, session?.legalName]);

  // Return-to-origin: launch origin is persisted as `jsa_returnTo` in
  // AsyncStorage by the deep-link handlers. Convert to a stable enum for the
  // UI and for the submit modal's button choices. Re-read on focus so the
  // return chip disappears after the user actually deep-links back out.
  const [launchOrigin, setLaunchOrigin] = useState<'wbs' | 'wbt' | 'wbew' | 'standalone'>('standalone');
  const readLaunchOrigin = useCallback(async () => {
    const raw = await AsyncStorage.getItem('jsa_returnTo').catch(() => null);
    if (!raw) { setLaunchOrigin('standalone'); return; }
    switch (raw) {
      case 'wbs':
      case 'wellbuilt-suite':
        setLaunchOrigin('wbs'); break;
      case 'wbt':
      case 'wellbuilt-tickets':
        setLaunchOrigin('wbt'); break;
      case 'wellbuilt-ewallet':
        setLaunchOrigin('wbew'); break;
      default:
        setLaunchOrigin('standalone');
    }
  }, []);
  useEffect(() => { readLaunchOrigin(); }, [deepLinked, readLaunchOrigin]);
  useFocusEffect(useCallback(() => { readLaunchOrigin(); }, [readLaunchOrigin]));

  // Post-submit clear-form gate. Signoff sets `@jsa/clearFormOnNextFocus`
  // before the completion modal opens. When the driver returns here via
  // Done / Stay on JSA / Return-to-origin, we read the flag, wipe the form
  // state, and remove the flag (one-shot). This is what prevents rows the
  // driver deleted pre-submit from coming back on the next session.
  const clearFormIfRequested = useCallback(async () => {
    try {
      const flag = await AsyncStorage.getItem('@jsa/clearFormOnNextFocus');
      if (flag !== '1') return;
      console.log('[JSA][form-reset] clearFormOnNextFocus=1 — wiping form state');
      setAddedWells([]);
      setAddedLocations([]);
      setWellName('');
      setLocationInput('');
      setJobActivityName('');
      setPusher('');
      setOtherInfo('');
      setDate(new Date().toISOString().slice(0, 10));
      setHydrationSource('post_submit_clear');
      noActivityLoggedRef.current = false;
      await AsyncStorage.removeItem('@jsa/clearFormOnNextFocus').catch(() => {});
    } catch (err) {
      console.warn('[JSA][form-reset] failed:', err);
    }
  }, []);
  useFocusEffect(useCallback(() => { clearFormIfRequested(); }, [clearFormIfRequested]));

  const trimmedLocation = locationInput.trim();
  const hasWellOrLocation = addedWells.length > 0 || wellName.trim().length > 0 || addedLocations.length > 0 || trimmedLocation.length > 0;
  const hasActivity = jobActivityName.trim().length > 0;
  // Session-level warning: wells exist but no activity defined. Logged once
  // so the field-test log isn't spammed. This is the signal that upstream
  // data will deliver empty resolvedActivity to JsaSummaryCard.
  useEffect(() => {
    if (hasWellOrLocation && !hasActivity && !noActivityLoggedRef.current) {
      noActivityLoggedRef.current = true;
      console.warn('[JSA][NO_ACTIVITY_DEFINED] wells/locations exist but jobActivityName is empty', {
        wells: addedWells.length,
        locations: addedLocations.length,
      });
    }
    // Reset the one-shot when activity is cleared AND list empties, so a
    // later add-without-activity event logs again.
    if (!hasWellOrLocation && !hasActivity) noActivityLoggedRef.current = false;
  }, [hasWellOrLocation, hasActivity, addedWells.length, addedLocations.length]);
  // Deep-linked (pre-shift from WB S): driver may not have a job yet, well/location optional
  // Form is hidden when JSA completed, so no need for jsaCompletedToday check here.
  // Activity is required whenever wells/locations exist — prevents submitting
  // rows with empty resolvedActivity.
  const isNextDisabled =
    !driverName.trim() ||
    !truckNumber.trim() ||
    (!hasWellOrLocation && !deepLinked) ||
    (hasWellOrLocation && !hasActivity);

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

  // Activity-required guard. Any path that adds a well or location must
  // have jobActivityName populated — otherwise the row will ship with an
  // empty resolvedActivity and render as `[]`. Inline alert is clearer than
  // a silent dismissal; driver sees exactly why the add was rejected.
  const requireActivityOrWarn = (): boolean => {
    if (jobActivityName.trim().length > 0) return true;
    Alert.alert(
      t("Job Type Required") || "Job Type Required",
      t("Enter a Job Type before adding a well or location.") ||
        "Enter a Job Type before adding a well or location.",
      [{ text: t("OK") || "OK" }],
    );
    return false;
  };

  const handleWellSelect = (well: WellRecord) => {
    if (!requireActivityOrWarn()) return;
    const entry = { name: well.well_name, operator: well.operator, county: well.county, jobType: jobActivityName.trim() };
    if (!addedWells.some(w => w.name === well.well_name && w.operator === well.operator)) {
      setAddedWells((prev) => [...prev, entry]);
      setHydrationSource('user_input');
    }
    setWellName("");
    setWellSuggestions([]);
    // Keep jobActivityName — driver is often adding multiple wells for the
    // same activity. Form field stays populated; they clear it manually if
    // switching activities between wells.
    setJobTypeSuggestions([]);
  };

  const addWellManual = () => {
    const trimmed = wellName.trim();
    if (!trimmed) return;
    if (!requireActivityOrWarn()) return;
    if (!addedWells.some(w => w.name.toLowerCase() === trimmed.toLowerCase())) {
      setAddedWells((prev) => [...prev, { name: trimmed, operator: '', county: '', jobType: jobActivityName.trim() }]);
      setHydrationSource('user_input');
    }
    setWellName("");
    setWellSuggestions([]);
    setJobTypeSuggestions([]);
  };

  const removeWellFromList = (name: string) => {
    setAddedWells((prev) => prev.filter((item) => item.name !== name));
  };

  const addLocationToList = (loc: string) => {
    const trimmed = loc.trim();
    if (!trimmed) return;
    if (!requireActivityOrWarn()) return;
    if (!addedLocations.some(l => l.toLowerCase() === trimmed.toLowerCase())) {
      setAddedLocations((prev) => [...prev, trimmed]);
      setHydrationSource('user_input');
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

        // Truck # hydration — filter pollution at EVERY source. If any source
        // reports truck == login display/legal name, treat it as corrupt and
        // clear from storage. Sources in priority order:
        //   1. ssoTruck  (one-time, from WB S/WB T deep link login.tsx handler)
        //   2. storedTruck  (AsyncStorage persisted from prior session)
        //   3. profileData.truckNumber  (RTDB drivers/approved/{hash}/profile)
        if (ssoTruck) {
          if (!isTruckPolluted(ssoTruck)) setTruckNumber(ssoTruck);
          // Always remove the one-shot key, whether clean or polluted.
          AsyncStorage.removeItem('@jsa/ssoTruck').catch(() => {});
        } else if (storedTruck) {
          if (isTruckPolluted(storedTruck)) {
            // Purge so next render doesn't re-hydrate it.
            AsyncStorage.removeItem(STORAGE_KEYS.truckNumber).catch(() => {});
          } else {
            setTruckNumber(storedTruck);
          }
        }
        // Driver name: use session legalName first, then stored
        if (!driverName && storedDriver) setDriverName(storedDriver);

        // Fetch fresh profile from RTDB — gets legalName, truck#, assignedCustomers
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
          // Truck from RTDB — also filtered. If RTDB is polluted (user's
          // profile literally has truckNumber="TabletS10"), ignore it.
          const rtdbTruck = profileData.truckNumber || '';
          const rtdbTruckClean = rtdbTruck && !isTruckPolluted(rtdbTruck);
          const currentTruck =
            (ssoTruck && !isTruckPolluted(ssoTruck)) ? ssoTruck :
            (storedTruck && !isTruckPolluted(storedTruck)) ? storedTruck : '';
          if (rtdbTruckClean) {
            // RTDB is the authoritative truth when not polluted.
            if (!currentTruck) {
              setTruckNumber(rtdbTruck);
            }
          } else if (!currentTruck) {
            // Nothing clean anywhere. Make sure the field is empty rather
            // than whatever the initial render might have left.
            setTruckNumber('');
            AsyncStorage.removeItem(STORAGE_KEYS.truckNumber).catch(() => {});
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
        // A save is "resumable" only if:
        //   1. driver/truck/today match
        //   2. its id is NOT in @jsa/dismissedIds (signoff writes there on submit)
        //   3. it has NO completion signal (neither typed name nor drawn signature image)
        // Previously the filter was just `!item.signature` — a submitted JSA with
        // an empty typed name field (image-only signature) slipped through and
        // re-appeared as "Pick Up Where I Left Off" after redirect.
        const [stored, dismissedRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.saves),
          AsyncStorage.getItem('@jsa/dismissedIds'),
        ]);
        let dismissedIds: Set<string> = new Set();
        if (dismissedRaw) {
          try {
            const arr = JSON.parse(dismissedRaw);
            if (Array.isArray(arr)) dismissedIds = new Set(arr.map(String));
          } catch {}
        }
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const today = new Date().toISOString().slice(0, 10);
            const matches = parsed.filter(
              (item) =>
                (item.driverName || "").trim() === name &&
                (item.truckNumber || "").trim() === truck &&
                item.date === today &&
                !dismissedIds.has(String(item.id || '')) &&
                !item.signature &&
                !item.signatureImage
            );
            if (matches.length) {
              const latest = matches.sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
              )[0];
              setContinueJsa(latest);
            } else {
              setContinueJsa(null);
            }
          } else {
            setContinueJsa(null);
          }
        } else {
          setContinueJsa(null);
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
    // Resume via the modern flow: /steps → /ppe → /signoff. Mirrors handleNext's
    // param shape so the resumed JSA walks the same screens as a new one
    // (consistent wells/locations render, no legacy /openJsas shortcut).
    const rawWells = Array.isArray(continueJsa.wells) ? continueJsa.wells : [];
    const wellsForParam = rawWells
      .map((w: any) => typeof w === 'string'
        ? { name: w, operator: '', county: '', jobType: continueJsa.jobActivityName || '', source: 'ndic' as const }
        : {
            name: w?.name || '',
            operator: w?.operator || '',
            county: w?.county || '',
            jobType: w?.jobType || continueJsa.jobActivityName || '',
            source: (w?.source || 'ndic') as 'ndic' | 'manual' | 'stamp',
          })
      .filter((w: { name: string }) => w.name);
    const locationsForParam = Array.isArray(continueJsa.locations) ? continueJsa.locations : [];
    router.push({
      pathname: "/steps",
      params: {
        driverName: continueJsa.driverName || driverName,
        truckNumber: continueJsa.truckNumber || truckNumber,
        jobActivityName: continueJsa.jobActivityName || continueJsa.task || '',
        pusher: continueJsa.pusher || '',
        wellName: wellsForParam[0]?.name || continueJsa.wellName || '',
        wells: JSON.stringify(wellsForParam),
        otherInfo: continueJsa.otherInfo || '',
        location: locationsForParam[0] || continueJsa.location || '',
        locations: JSON.stringify(locationsForParam),
        date: new Date().toISOString().slice(0, 10),
        jsaSessionId: Date.now().toString(),
      },
    });
  };

  // ── TEMP DEBUG (remove after field-test audit) ─────────────────────────
  // Proves whether "TabletS10 showing in all fields" is React state
  // contamination or an Android autofill / keyboard overlay. State values
  // are logged on mount and on every change, and rendered in an on-screen
  // panel at the top of the form. Compare panel values to what the input
  // fields visually show.
  useEffect(() => {
    console.log('[JSA-DEBUG] Mount — session snapshot:', JSON.stringify({
      displayName: session?.displayName ?? null,
      legalName: session?.legalName ?? null,
      companyId: session?.companyId ?? null,
    }));
  }, []);
  useEffect(() => {
    console.log('[JSA-DEBUG] State:', JSON.stringify({
      driverName,
      truckNumber,
      date,
      jobActivityName,
      pusher,
      otherInfo,
    }));
  }, [driverName, truckNumber, date, jobActivityName, pusher, otherInfo]);
  // ── END TEMP DEBUG ─────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        {/* === PINNED HEADER (outside ScrollView) === */}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Persistent return-to-origin chip — visible whenever the JSA
                was launched from another WB app. If user chose "Stay on JSA"
                on the submit modal they can still return here. */}
            {(launchOrigin === 'wbs' || launchOrigin === 'wbt' || launchOrigin === 'wbew') && (
              <TouchableOpacity
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  backgroundColor: accent,
                  borderRadius: 8,
                }}
                onPress={async () => {
                  const scheme =
                    launchOrigin === 'wbs' ? 'wellbuilt-suite://' :
                    launchOrigin === 'wbt' ? 'wellbuilt-tickets://' :
                    'wellbuilt-ewallet://';
                  const { Linking } = require('react-native');
                  try { await Linking.openURL(scheme); } catch (err) {
                    console.warn('[JSA] Return-to-origin failed:', err);
                  }
                }}
                accessibilityLabel="Return to origin app"
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                  {launchOrigin === 'wbs' ? t("Return to WB S") :
                   launchOrigin === 'wbt' ? t("Return to WB T") :
                   t("Return to WB eW")}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.menuButton}
              onPress={() => router.push("/settings" as any)}
              accessibilityLabel="Open settings"
            >
              <Text style={styles.menuIcon}>⚙</Text>
            </TouchableOpacity>
          </View>
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8, maxHeight: 40 }}>
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

        {/* === SCROLLABLE CONTENT (ScrollView starts here) === */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.container}
          contentContainerStyle={[
            styles.scrollContent,
            keyboardVisible && { paddingBottom: 250 }
          ]}
          keyboardShouldPersistTaps="handled"
        >
        {/* ── TEMP DEBUG (remove after field-test audit) ──────────────────
            Shows ACTUAL React state for the 6 JSA fields. Compare against
            what the input fields visually show. If panel shows "" but the
            field shows "TabletS10" → Android autofill / keyboard overlay.
            If panel shows "TabletS10" → real state contamination. */}
        <View style={{ backgroundColor: '#FFE4E1', padding: 10, marginBottom: 8, borderRadius: 8, borderWidth: 2, borderColor: '#DC143C' }}>
          <Text style={{ fontWeight: '800', fontSize: 11, color: '#8B0000', marginBottom: 6 }}>DEBUG — React state (remove after audit)</Text>
          <Text style={{ fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#333' }}>
            {`hydrationSource: ${hydrationSource}\nactiveJsaId:     ${currentJsa?.id ?? '(none)'}\nactiveJsas:      ${activeJsas.length}\nwellsCount:      ${addedWells.length}\nlocationsCount:  ${addedLocations.length}\njobActivity:     "${jobActivityName}"\n— identity —\nsession.displayName: "${session?.displayName ?? ''}"\nsession.legalName:   "${session?.legalName ?? ''}"\n— form state —\ndriverName:  "${driverName}"\ntruckNumber: "${truckNumber}"\ndate:        "${date}"\npusher:      "${pusher}"\nnotes:       "${otherInfo}"`}
          </Text>
        </View>
        {/* ── END TEMP DEBUG ─────────────────────────────────────────── */}
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

              // Calculate available height: screen - header(80) - banner(80) - tabs(45) - footer(120) - tabBar(60) - padding(32)
              const jsaViewHeight = Dimensions.get('window').height - (activeJsas.length > 1 ? 417 : 372);
              return (
                <View style={{ height: Math.max(jsaViewHeight, 300), borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: 0 }}>
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
              ref={driverNameRef}
              style={styles.input}
              placeholder={t("Enter driver name")}
              placeholderTextColor={colors.textMuted}
              value={driverName}
              onChangeText={setDriverName}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => truckNumberRef.current?.focus()}
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Truck #")}</Text>
            <TextInput
              ref={truckNumberRef}
              style={styles.input}
              placeholder={t("e.g. 105")}
              placeholderTextColor={colors.textMuted}
              value={truckNumber}
              onChangeText={setTruckNumber}
              keyboardType="numeric"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => dateRef.current?.focus()}
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>{t("Date")}</Text>
            <TextInput
              ref={dateRef}
              style={styles.input}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={date}
              onChangeText={setDate}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => jobActivityRef.current?.focus()}
              autoComplete="off"
              importantForAutofill="no"
            />
            <Text style={styles.helperText}>
              {t("Defaults to today. Edit if needed.")}
            </Text>
          </View>

          {/* — Well / Location + Job Type (single section) — */}
          <View style={[styles.field, { zIndex: 20 }]}>
            {/* Job Type first — driver picks job type, then well */}
            <Text style={styles.label}>{t("Job Type")}</Text>
            <TextInput
              ref={jobActivityRef}
              style={styles.input}
              placeholder={t("e.g. Production Water, Service Work...")}
              placeholderTextColor={colors.textMuted}
              value={jobActivityName}
              onChangeText={handleJobTypeTextChange}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => wellNameRef.current?.focus()}
              autoComplete="off"
              importantForAutofill="no"
            />
            {jobTypeSuggestions.length > 0 && (
              <View style={styles.autocompleteDropdown}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {jobTypeSuggestions.map((jt, index) => (
                    <TouchableOpacity
                      key={jt}
                      style={[styles.dropdownItem, index === jobTypeSuggestions.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={() => handleJobTypeSelect(jt)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.dropdownItemText}>{jt}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={[styles.label, { marginTop: 14 }]}>{t("Well / Location")}</Text>
            {wellDataLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={accent} />
                <Text style={styles.loadingText}>{t("Loading NDIC wells...")}</Text>
              </View>
            )}
            <TextInput
              ref={wellNameRef}
              style={styles.input}
              placeholder={wellDataLoading ? t("Loading wells...") : t("Search wells or enter location...")}
              placeholderTextColor={colors.textMuted}
              value={wellName}
              onChangeText={(text) => {
                handleWellTextChange(text);
                setLocationInput(text);
              }}
              onFocus={() => setWellFieldFocused(true)}
              onBlur={() => {
                // Delay so tapping a suggestion item lands before the dropdown unmounts.
                setTimeout(() => {
                  setWellFieldFocused(false);
                  setWellSuggestions([]);
                }, 150);
              }}
              returnKeyType="next"
              blurOnSubmit={false}
              // Next must advance focus to the Pusher field, not just dismiss
              // the keyboard. Add the typed entry (if any) on the way out.
              onSubmitEditing={() => {
                addWellManual();
                setWellFieldFocused(false);
                setWellSuggestions([]);
                pusherRef.current?.focus();
              }}
              autoComplete="off"
              importantForAutofill="no"
            />
            {/* NDIC well suggestions */}
            {wellFieldFocused && wellSuggestions.length > 0 && (
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
                      onPress={() => {
                        handleWellSelect(well);
                        setLocationInput("");
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.dropdownItemText}>{well.well_name}</Text>
                      <Text style={styles.dropdownItemSub}>{well.operator} • {well.county} Co.</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            {/* Favorite location suggestions (when no NDIC matches) */}
            {wellFieldFocused && wellSuggestions.length === 0 && (() => {
              const trimmed = wellName.trim().toLowerCase();
              const matches = trimmed && trimmed.length >= 2
                ? favoriteLocations.filter((f) => f.toLowerCase().includes(trimmed) && f.toLowerCase() !== trimmed)
                : [];
              return matches.length > 0 ? (
                <View style={styles.autocompleteDropdown}>
                  <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {matches.map((fav, index) => (
                      <TouchableOpacity
                        key={fav}
                        style={[styles.dropdownItem, index === matches.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => {
                          addLocationToList(fav);
                          setWellName("");
                          setWellSuggestions([]);
                        }}
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
                        <Text style={styles.dropdownItemSub}>{t("Saved location")}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null;
            })()}
            {/* Manual add button (no NDIC matches) */}
            {wellName.trim().length >= 2 && wellSuggestions.length === 0 && !wellDataLoading && (
              <TouchableOpacity
                style={styles.saveInlineButton}
                onPress={() => {
                  addWellManual();
                  setLocationInput("");
                }}
              >
                <Text style={styles.saveInlineText}>+ {t("Add")} "{wellName.trim()}"</Text>
              </TouchableOpacity>
            )}

            {/* Combined list: Location & Activity (paired well/location + job).
                Activity is resolved ONCE per row via the shared
                resolveActivity helper. Empty resolvedActivity is a data bug
                (logged inside the helper), not a UI layout issue. */}
            {(addedWells.length > 0 || addedLocations.length > 0) && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>{t("Added Location & Activity")}</Text>
                <View style={[styles.favoriteList, { marginTop: 6 }]}>
                  {addedWells.map((well) => {
                    const resolvedActivity = resolveActivity(well, { jobActivityName });
                    if (!resolvedActivity) {
                      console.warn('[JSA][resolvedActivity MISSING] added well:', JSON.stringify({ well, jobActivityName }));
                    }
                    return (
                      <View
                        key={`well-${well.name}`}
                        style={[styles.favoriteRow, { flexDirection: 'column', alignItems: 'stretch' }]}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.favoriteText} numberOfLines={1}>{well.name}</Text>
                          <Text style={[styles.wellDetailText, { marginLeft: 8 }]} numberOfLines={1}>[{resolvedActivity}]</Text>
                          <View style={{ flex: 1 }} />
                          <TouchableOpacity onPress={() => removeWellFromList(well.name)} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                            <Text style={styles.favoriteAdd}>{t("Remove")}</Text>
                          </TouchableOpacity>
                        </View>
                        {(well.operator || well.county) && (
                          <Text style={[styles.wellDetailText, { marginTop: 2 }]} numberOfLines={1}>
                            {[well.operator, well.county ? `${well.county} Co.` : ''].filter(Boolean).join(' • ')}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                  {addedLocations.map((loc) => {
                    const resolvedActivity = resolveActivity(undefined, { jobActivityName });
                    if (!resolvedActivity) {
                      console.warn('[JSA][resolvedActivity MISSING] added location:', JSON.stringify({ loc, jobActivityName }));
                    }
                    return (
                    <View
                      key={`loc-${loc}`}
                      style={styles.favoriteRow}
                    >
                      <Text style={styles.favoriteText} numberOfLines={1}>{loc}</Text>
                      <Text style={[styles.wellDetailText, { marginLeft: 8 }]} numberOfLines={1}>[{resolvedActivity}]</Text>
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity onPress={() => removeLocationFromList(loc)} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                        <Text style={styles.favoriteAdd}>{t("Remove")}</Text>
                      </TouchableOpacity>
                    </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>

          {/* — Pusher — */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("Pusher")}</Text>
            <TextInput
              ref={pusherRef}
              style={styles.input}
              placeholder={t("Pusher name")}
              placeholderTextColor={colors.textMuted}
              value={pusher}
              onChangeText={setPusher}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => otherInfoRef.current?.focus()}
              autoComplete="off"
              importantForAutofill="no"
            />
          </View>

          {/* — Notes — (last field in tab order) */}
          <View style={styles.field}>
            <Text style={styles.label}>{t("Notes")}</Text>
            <TextInput
              ref={otherInfoRef}
              style={[styles.input, styles.multiline]}
              placeholder={t("Notes")}
              placeholderTextColor={colors.textMuted}
              value={otherInfo}
              onChangeText={setOtherInfo}
              multiline
              returnKeyType="done"
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

        {/* Fixed footer buttons — outside ScrollView, pinned to bottom */}
        {jsaCompletedToday && currentJsa && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: accent, marginBottom: 0 }]}
              onPress={() => setShowAddWellModal(true)}
            >
              <Text style={styles.buttonText}>{t("+ Add Well / Location")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dc2626', marginBottom: 0 }]}
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
                        // Track dismissed ID so hydration doesn't re-add it
                        const dismissedJsa = activeJsas[activeJsaIndex];
                        if (dismissedJsa?.id) {
                          dismissedIdsRef.current.add(dismissedJsa.id);
                          AsyncStorage.getItem('@jsa/dismissedIds').then(raw => {
                            const list = raw ? JSON.parse(raw) : [];
                            list.push(dismissedJsa.id);
                            AsyncStorage.setItem('@jsa/dismissedIds', JSON.stringify(list)).catch(() => {});
                          }).catch(() => {});
                        }
                        setActiveJsas(prev => prev.filter((_, i) => i !== activeJsaIndex));
                        setActiveJsaIndex(0);
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
          </View>
        )}
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
