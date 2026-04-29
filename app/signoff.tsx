import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { JsaSummaryCard, buildLocationActivityRows } from "../components/jsa";
import SignatureModal from "../components/SignatureModal";
import { colors } from "../constants/colors";
import {
    PREPARED_FOR_WORK_ITEMS,
} from "../constants/jsaTemplate";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { fetchDriverProfile, getDriverSession } from "../services/driverAuth";
import { wbDiagLog } from "../services/wbDiagLog";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

type Params = {
  driverName?: string;
  truckNumber?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  wells?: string;
  otherInfo?: string;
  location?: string;
  task?: string;
  date?: string;
  ppeSelected?: string;
  locations?: string;
  locationAcks?: string;
};

export default function SignoffScreen() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const { t } = useLanguage();
  const { emergencyContacts: themeEmergencyContacts, companyContacts: themeCompanyContacts, accent, jsaTemplate } = useTheme();
  const preparedItemsList = jsaTemplate?.preparedItems ?? PREPARED_FOR_WORK_ITEMS;

  // Contacts from company config (managed in Dashboard Settings > JSA)
  const emergencyContacts = themeEmergencyContacts.map((c, i) => ({ id: `ec-${i}`, ...c }));
  const companyContacts = themeCompanyContacts.map((c, i) => ({ id: `cc-${i}`, ...c }));

  const [prepared, setPrepared] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState(params.driverName as string || "");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const isLoadedRef = useRef(false);

  // Branded post-submit modal. Shown ONCE after saveAndGo completes —
  // replaces the two-Alert double-confirm flow. Buttons adapt to launch origin.
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeOrigin, setCompleteOrigin] = useState<'wbs' | 'wbt' | 'wbew' | 'standalone'>('standalone');
  const [completeReturnScheme, setCompleteReturnScheme] = useState<string | null>(null);

  // Pre-load drawn signature from Firebase profile (same as WB T / WB S)
  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchDriverProfile();
        if (profile?.signature) {
          setSignatureImage(profile.signature);
          console.log('[JSA-Signoff] Pre-loaded signature from Firebase profile');
        }
      } catch (err) {
        console.warn('[JSA-Signoff] Failed to load signature:', err);
      }
    })();
  }, []);

  // Parse wells and locations passed from previous screen
  // Parse wells — supports both old (string[]) and new (WellEntry[]) formats
  const wellsList = useMemo(() => {
    try {
      const parsed = params.wells ? JSON.parse(params.wells) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [params.wells]);

  // Well names for display
  const wellNames = useMemo(() => {
    return wellsList.map((w: any) => typeof w === 'string' ? w : w?.name || '');
  }, [wellsList]);

  const locations = useMemo(() => {
    try {
      const parsed = params.locations ? JSON.parse(params.locations) : [];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [params.locations]);

  const locationAcks = useMemo(() => {
    try {
      const parsed = params.locationAcks ? JSON.parse(params.locationAcks) : {};
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore
    }
    return {};
  }, [params.locationAcks]);

  // Pre-resolve rows at the data layer. JsaSummaryCard no longer does any
  // fallback lookups — each row's resolvedActivity is baked in here.
  const summaryRows = useMemo(() => (
    buildLocationActivityRows(
      wellsList,
      locations,
      {
        jobActivityName: params.jobActivityName as string | undefined,
        task: params.task as string | undefined,
      },
    )
  ), [wellsList, locations, params.jobActivityName, params.task]);

  const togglePrepared = (id: string) => {
    setPrepared((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    const loadPrepared = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.prepared);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && typeof parsed === "object") {
            setPrepared(parsed);
          }
        }
      } catch (error) {
        console.warn("Failed to load prepared toggles", error);
      } finally {
        isLoadedRef.current = true;
      }
    };
    loadPrepared();
  }, []);

  useEffect(() => {
    if (!isLoadedRef.current) return;
    AsyncStorage.setItem(STORAGE_KEYS.prepared, JSON.stringify(prepared)).catch((error) =>
      console.warn("Failed to save prepared toggles", error)
    );
  }, [prepared]);

  const handleSubmit = () => {
    // Validation: Drawn signature required
    if (!signatureImage) {
      Alert.alert(
        t("Signature Required") || "Signature Required",
        t("Please sign before submitting. Tap the signature area to draw your signature."),
        [{ text: t("OK") || "OK" }]
      );
      return;
    }

    const saveAndGo = async () => {
      // Parse PPE into structured format for JSARecord
      let ppeObj: Record<string, boolean> = {};
      let ppeOtherItems: string[] = [];
      try {
        const parsed = params.ppeSelected ? JSON.parse(params.ppeSelected as string) : {};
        if (parsed?.selected) { ppeObj = parsed.selected; ppeOtherItems = parsed.otherItems || []; }
        else if (typeof parsed === 'object' && !Array.isArray(parsed)) ppeObj = parsed;
      } catch {}

      // ── Activity persistence contract ────────────────────────────
      // Read-mode (viewJsa) resolves activity by locationActivity.ts,
      // which checks row.jobType → form.jobActivityName → form.task →
      // form.jsaType. For saves loaded later to render readable text,
      // those fields must be NON-EMPTY in the persisted record — we
      // can't rely on any live form state after submit.
      //
      // Previously this save path wrote params through as-is:
      //   wells kept whatever jobType was at push-time (could be ""
      //   for wells added via deep-link autofill or jsa_day_status
      //   stamped-wells path, both of which bypass the home-screen
      //   activity enforcement),
      //   jobActivityName = params.jobActivityName (could be ""),
      //   task             = params.task            (could be "").
      // If the driver submitted without a typed activity (bypassable
      // via pre-enforcement builds, stamped-wells, or deep-link
      // autofill without a jobType param), EVERY resolution source
      // persisted empty, and viewJsa rendered "[]" glyphs.
      //
      // Fix: derive ONE canonical activity from every in-scope source
      // at save time — form-level params, then any well's own jobType.
      // Backfill wells that have empty jobType + backfill form-level
      // jobActivityName/task when empty. Per-row jobType is preferred
      // by the resolver, so wells with their own jobType keep it.
      const paramsJobActivityName = (typeof params.jobActivityName === 'string' ? params.jobActivityName : '').trim();
      const paramsTask = (typeof params.task === 'string' ? params.task : '').trim();
      const firstWellJobType = (() => {
        for (const w of wellsList) {
          if (typeof w === 'string') continue;
          const j = (w && typeof (w as any).jobType === 'string') ? (w as any).jobType.trim() : '';
          if (j) return j;
        }
        return '';
      })();
      const canonicalActivity = paramsJobActivityName || paramsTask || firstWellJobType || '';
      if (!canonicalActivity) {
        console.warn('[JSA][save] submitting JSA with NO activity anywhere', {
          paramsJobActivityName,
          paramsTask,
          wellsWithoutJobType: wellsList.filter((w: any) => typeof w === 'string' || !((w as any)?.jobType || '').trim()).length,
          totalWells: wellsList.length,
        });
      }
      const wellsForSave = wellsList.map((w: any) => {
        if (typeof w === 'string') {
          return { name: w, operator: '', county: '', jobType: canonicalActivity };
        }
        const existing = (typeof w.jobType === 'string' ? w.jobType : '').trim();
        return { ...w, jobType: existing || canonicalActivity };
      });

      // Resolve session up front so linkage fields land in BOTH the local
      // AsyncStorage save (replayed by syncToCloud) AND the direct Firestore
      // writes below. Historically the jsas collection docs had no driverHash
      // at all, so "all JSAs by Mike" couldn't be queried server-side.
      const sessionForPayload = await getDriverSession().catch(() => null);
      const driverHashForPayload = sessionForPayload?.passcodeHash || '';
      const companyIdForPayload =
        sessionForPayload?.companyId
        || (await AsyncStorage.getItem('selectedCompanyId').catch(() => null))
        || '';
      const driverLegalNameForPayload =
        sessionForPayload?.legalName
        || sessionForPayload?.displayName
        || (params.driverName as string)
        || '';

      // shiftId — scopes this JSA to the active shift. WB T / WB JSA local
      // hydration filters saves by shiftId so old shifts' JSAs don't bleed
      // into a fresh shift.
      //
      // ALIGNMENT RULE (post-2026-04-29 audit):
      //   - shiftId IS in AsyncStorage  → scopeSource='shiftId', use it
      //   - shiftId is NOT in AsyncStorage → scopeSource='date', use today (legacy)
      //
      // The choice is stamped into a diagnostic so a post-mortem can prove
      // the write side and the close-job read side picked the same scope.
      const shiftIdInStorage = await AsyncStorage.getItem('wellbuilt-current-shift-id').catch(() => null);
      const dateForPayload = new Date().toISOString().slice(0, 10);
      const scopeSource: 'shiftId' | 'date' = shiftIdInStorage ? 'shiftId' : 'date';
      const shiftIdForPayload = shiftIdInStorage || dateForPayload;

      // operator — scopes the JSA WITHIN a shift. A driver running for two
      // oil companies in one shift gets two distinct JSAs. Source order:
      // first well's operator field → params.operator (if WB T sent one) →
      // empty string (= shift-default scope, single-operator shift).
      const operatorForPayload = (() => {
        const fromWell = wellsForSave.find((w: any) => typeof w?.operator === 'string' && w.operator.trim())?.operator;
        if (fromWell) return String(fromWell).trim();
        const fromParam = typeof (params as any).operator === 'string' ? (params as any).operator.trim() : '';
        return fromParam;
      })();
      const operatorSlug = operatorForPayload
        ? operatorForPayload.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';
      const scopeForPayload = operatorSlug ? `${shiftIdForPayload}__${operatorSlug}` : shiftIdForPayload;

      const payload = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        driverName: params.driverName ?? "",
        // Linkage fields — required for server-side queries by driver.
        driverHash: driverHashForPayload,
        driverId: driverHashForPayload,
        driverLegalName: driverLegalNameForPayload,
        companyId: companyIdForPayload,
        shiftId: shiftIdForPayload,
        operator: operatorForPayload,
        operatorSlug,
        scope: scopeForPayload,
        createdAt: new Date().toISOString(),
        truckNumber: params.truckNumber ?? "",
        jobActivityName: paramsJobActivityName || canonicalActivity,
        pusher: params.pusher ?? "",
        wellName: params.wellName ?? "",
        wells: wellsForSave,
        otherInfo: params.otherInfo ?? "",
        location: params.location ?? "",
        task: paramsTask || canonicalActivity,
        date: params.date ?? "",
        ppeSelected: ppeObj,
        ppeOtherItems,
        ppeSelectedRaw: params.ppeSelected ?? "", // keep for completed screen params
        locations,
        locationAcks,
        prepared,
        notes,
        signature,
        signatureImage: signatureImage || '',
      };
      try {
        const existing = await AsyncStorage.getItem(STORAGE_KEYS.saves);
        const list = existing ? JSON.parse(existing) : [];
        const nextList = Array.isArray(list) ? [payload, ...list] : [payload];
        await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(nextList));
      } catch (error) {
        console.warn("Failed to save JSA", error);
      }

      // Mark this JSA as dismissed from the home-screen active tabs.
      // Submitted JSAs live in Saved JSAs; they shouldn't auto-rehydrate as tabs.
      try {
        const raw = await AsyncStorage.getItem('@jsa/dismissedIds');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!ids.includes(payload.id)) ids.push(payload.id);
        await AsyncStorage.setItem('@jsa/dismissedIds', JSON.stringify(ids));
        // Also drop any active tab matching this id so this session clears it instantly
        const activeRaw = await AsyncStorage.getItem('@jsa/activeJsas');
        if (activeRaw) {
          const active = JSON.parse(activeRaw);
          if (Array.isArray(active)) {
            const filtered = active.filter((j: any) => j?.id !== payload.id);
            await AsyncStorage.setItem('@jsa/activeJsas', JSON.stringify(filtered));
          }
        }
      } catch {}

      // Post-submit cloud write: single sequential IIFE that (1) generates
      // the PDF + uploads to Storage, then (2) writes jsa_day_status with
      // the resolved pdfUrl, then (3) writes jsas/{id} with full linkage.
      //
      // Previously two parallel IIFEs raced: the PDF IIFE stashed the URL
      // in AsyncStorage while the jsa_day_status IIFE read AsyncStorage
      // immediately, so jsa_day_status.pdfUrl was always empty. WB T read
      // that empty pdfUrl and couldn't attach the JSA PDF to invoices.
      //
      // Still fire-and-forget at the top level so the branded completion
      // modal renders immediately; sequencing is internal to the IIFE.
      (async () => {
        const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents';
        const API_KEY = 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI';
        const driverHash = driverHashForPayload;
        const companyId = companyIdForPayload;
        const driverLegalName = driverLegalNameForPayload;
        const formDate = typeof params.date === 'string' ? params.date : '';
        const jsaDate = /^\d{4}-\d{2}-\d{2}$/.test(formDate)
          ? formDate
          : new Date().toISOString().slice(0, 10);

        // Step 1 — generate + upload PDF. Await so jsa_day_status and jsas
        // writes below see the final URL, never an empty string.
        let pdfUrl = '';
        try {
          const { generateAndUploadJsaPdf } = await import('../services/jsaPdf');
          const ppeItems: string[] = [];
          try {
            const parsed = params.ppeSelected ? JSON.parse(params.ppeSelected as string) : {};
            if (parsed?.selected) {
              Object.entries(parsed.selected).forEach(([k, v]) => { if (v) ppeItems.push(k); });
            }
          } catch {}
          const preparedItems = Object.entries(prepared).filter(([, v]) => v).map(([k]) => k);
          const url = await generateAndUploadJsaPdf({
            driverName: (params.driverName as string) || driverLegalName,
            truckNumber: (params.truckNumber as string) || '',
            date: jsaDate,
            wells: wellsList,
            locations: locations as string[],
            jobActivity: (params.jobActivityName as string) || '',
            pusher: (params.pusher as string) || '',
            ppeItems,
            preparedItems,
            notes,
            signature,
            signatureImage: signatureImage || undefined,
            companyName: companyId,
            accentColor: accent,
          }, companyId, {
            driverHash,
            jsaDocId: payload.id,
            jsaDate,
          });
          if (url) {
            pdfUrl = url;
            await AsyncStorage.setItem('jsa_pdfUrl', url).catch(() => {});
            console.log('[JSA] PDF ready for WB T:', url);
          } else {
            console.warn('[JSA] PDF URL empty after upload — downstream writes will have no pdfUrl');
          }
        } catch (err) {
          console.warn('[JSA] PDF generate/upload failed (non-fatal):', err);
        }

        // Step 2 — jsa_day_status write with pdfUrl in hand. Doc id keyed
        // by (shiftId, operatorSlug) — each oil company the driver works
        // in this shift gets its own day-status doc. Falls back to plain
        // shiftId (or today) when no operator/shift is active.
        if (driverHash) {
          try {
            const scope = scopeForPayload;
            const docId = `${driverHash}_${scope}`;

            // Read existing wells[] + locations[] so WB T-stamped entries aren't clobbered.
            let existingWells: any[] = [];
            let existingLocations: any[] = [];
            try {
              const getResp = await fetch(`${FIRESTORE_BASE}/jsa_day_status/${docId}?key=${API_KEY}`);
              if (getResp.ok) {
                const doc = await getResp.json();
                existingWells = doc.fields?.wells?.arrayValue?.values || [];
                existingLocations = doc.fields?.locations?.arrayValue?.values || [];
              }
            } catch {}
            // Cross-bucket dedup (TASK 3 from 2026-04-29 alignment audit):
            // a name must NOT appear in both wells[] and locations[] of the
            // same doc. Earlier code only deduped each bucket against its
            // own existing entries, so a JSA where the form added "Well A"
            // to locations[] while WB T already stamped "Well A" to wells[]
            // ended up with both entries (ghost duplicate). Now we maintain
            // a single union of "names already in this doc" across both
            // buckets, and form additions are filtered against that union
            // — duplicates are dropped pre-storage, not just at UI dedup.
            const allKnownNames = new Set<string>();
            for (const v of existingWells) {
              const n = v?.mapValue?.fields?.name?.stringValue?.trim().toUpperCase();
              if (n) allKnownNames.add(n);
            }
            for (const v of existingLocations) {
              const n = v?.mapValue?.fields?.name?.stringValue?.trim().toUpperCase();
              if (n) allKnownNames.add(n);
            }

            const formWells = wellsList
              .map((w: any) => {
                const name = typeof w === 'string' ? w : (w?.name || '');
                const jobType = typeof w === 'string'
                  ? (params.jobActivityName || '')
                  : (w?.jobType || params.jobActivityName || '');
                return { name, jobType };
              })
              .filter(w => {
                const k = w.name?.trim().toUpperCase();
                if (!k) return false;
                if (allKnownNames.has(k)) return false;
                allKnownNames.add(k); // claim the name so locations[] won't take it too
                return true;
              })
              .map(w => ({
                mapValue: {
                  fields: {
                    name: { stringValue: w.name },
                    type: { stringValue: 'pickup' },
                    jobType: { stringValue: w.jobType },
                    stampedAt: { timestampValue: new Date().toISOString() },
                  },
                },
              }));
            const wellsForFirestore = [...existingWells, ...formWells];

            const formLocations = (Array.isArray(locations) ? locations : [])
              .map((l: any) => (typeof l === 'string' ? l : (l?.name || '')))
              .filter((name: string) => {
                const k = name?.trim().toUpperCase();
                if (!k) return false;
                if (allKnownNames.has(k)) return false;
                allKnownNames.add(k);
                return true;
              })
              .map((name: string) => ({
                mapValue: {
                  fields: {
                    name: { stringValue: name },
                    type: { stringValue: 'location' },
                    jobType: { stringValue: (params.jobActivityName as string) || '' },
                    stampedAt: { timestampValue: new Date().toISOString() },
                  },
                },
              }));
            const locationsForFirestore = [...existingLocations, ...formLocations];

            const patchUrl = `${FIRESTORE_BASE}/jsa_day_status/${docId}?key=${API_KEY}`
              + '&updateMask.fieldPaths=driverHash'
              + '&updateMask.fieldPaths=driverName'
              + '&updateMask.fieldPaths=companyId'
              + '&updateMask.fieldPaths=shiftId'
              + '&updateMask.fieldPaths=operatorSlug'
              + '&updateMask.fieldPaths=operatorName'
              + '&updateMask.fieldPaths=date'
              + '&updateMask.fieldPaths=jsaCompleted'
              + '&updateMask.fieldPaths=jsaCompletedAt'
              + '&updateMask.fieldPaths=jsaDocId'
              + '&updateMask.fieldPaths=pdfUrl'
              + '&updateMask.fieldPaths=wells'
              + '&updateMask.fieldPaths=locations'
              + '&updateMask.fieldPaths=updatedAt';

            const resp = await fetch(patchUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fields: {
                  driverHash: { stringValue: driverHash },
                  driverName: { stringValue: driverLegalName },
                  companyId: { stringValue: companyId },
                  shiftId: { stringValue: shiftIdForPayload },
                  operatorSlug: { stringValue: operatorSlug },
                  operatorName: { stringValue: operatorForPayload },
                  date: { stringValue: jsaDate },
                  jsaCompleted: { booleanValue: true },
                  jsaCompletedAt: { timestampValue: new Date().toISOString() },
                  jsaDocId: { stringValue: payload.id },
                  pdfUrl: { stringValue: pdfUrl },
                  wells: { arrayValue: { values: wellsForFirestore } },
                  locations: { arrayValue: { values: locationsForFirestore } },
                  updatedAt: { timestampValue: new Date().toISOString() },
                },
              }),
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => '');
              console.warn(`[JSA] jsa_day_status write failed: HTTP ${resp.status} ${body.slice(0, 200)}`);
              wbDiagLog({
                area: 'jsa',
                event: 'signoff.dayStatusWrite',
                source: 'signoff.saveAndGo',
                result: 'error',
                reason: `HTTP ${resp.status}`,
                driverHash,
                shiftId: shiftIdForPayload || undefined,
                operatorSlug: operatorSlug || undefined,
                extra: { docId, scope: scopeForPayload, status: resp.status },
              });
            } else {
              console.log(`[JSA] jsa_day_status/${docId} written (pdfUrl=${pdfUrl ? 'set' : 'empty'})`);
              // Structured alignment diagnostic — pairs with WB T's
              // [JSA-align][stamp.write] and [JSA-align][lookup] logs so
              // a field log can confirm signoff and closeJob targeted
              // the same docId with the same scopeSource.
              console.log(JSON.stringify({
                tag: '[JSA-align][signoff.dayStatusWrite]',
                scopeUsed: scopeSource,
                docId,
                shiftIdInStorage: shiftIdInStorage || null,
                operatorSlug: operatorSlug || null,
                wellCount: wellsForFirestore.length,
                locationCount: locationsForFirestore.length,
                jsaCompleted: true,
              }));
              wbDiagLog({
                area: 'jsa',
                event: 'signoff.dayStatusWrite',
                source: 'signoff.saveAndGo',
                result: 'ok',
                reason: 'jsa_day_status PATCH succeeded',
                driverHash,
                shiftId: shiftIdForPayload || undefined,
                operatorSlug: operatorSlug || undefined,
                counts: {
                  wells: wellsForFirestore.length,
                  locations: locationsForFirestore.length,
                },
                extra: { docId, scope: scopeForPayload, hasPdfUrl: !!pdfUrl },
              });
            }
          } catch (err) {
            console.warn('[JSA] jsa_day_status write error (non-fatal):', err);
            wbDiagLog({
              area: 'jsa',
              event: 'signoff.dayStatusWrite',
              source: 'signoff.saveAndGo',
              result: 'error',
              reason: (err as any)?.message || String(err).slice(0, 200),
              driverHash,
              shiftId: shiftIdForPayload || undefined,
              operatorSlug: operatorSlug || undefined,
              extra: { docId, scope: scopeForPayload, threw: true },
            });
          }
        } else {
          console.warn('[JSA] No driverHash — skipping jsa_day_status + jsas cloud write');
        }

        // Step 3 — jsas/{id} direct write with linkage. Primary path now that
        // the branded completion modal bypasses completed.tsx. syncToCloud
        // still exists as a backup for unsynced local saves — setDoc there
        // will idempotently overwrite with the same payload.
        if (driverHash) {
          try {
            const docUrl = `${FIRESTORE_BASE}/jsas/${payload.id}?key=${API_KEY}`;
            const fields: any = {
              id: { stringValue: payload.id },
              timestamp: { stringValue: payload.timestamp },
              createdAt: { timestampValue: new Date().toISOString() },
              driverHash: { stringValue: driverHash },
              driverId: { stringValue: driverHash },
              driverName: { stringValue: payload.driverName || driverLegalName },
              driverLegalName: { stringValue: driverLegalName },
              companyId: { stringValue: companyId },
              shiftId: { stringValue: shiftIdForPayload },
              operatorSlug: { stringValue: operatorSlug },
              operator: { stringValue: operatorForPayload },
              truckNumber: { stringValue: payload.truckNumber || '' },
              jobActivityName: { stringValue: payload.jobActivityName || '' },
              pusher: { stringValue: payload.pusher || '' },
              wellName: { stringValue: payload.wellName || '' },
              otherInfo: { stringValue: payload.otherInfo || '' },
              location: { stringValue: payload.location || '' },
              task: { stringValue: payload.task || '' },
              date: { stringValue: jsaDate },
              notes: { stringValue: payload.notes || '' },
              signature: { stringValue: payload.signature || '' },
              signatureImage: { stringValue: payload.signatureImage || '' },
              pdfUrl: { stringValue: pdfUrl },
              // Complex objects stored as JSON strings for compact REST encoding.
              ppeSelected: { stringValue: JSON.stringify(payload.ppeSelected || {}) },
              prepared: { stringValue: JSON.stringify(payload.prepared || {}) },
              locationAcks: { stringValue: JSON.stringify(payload.locationAcks || {}) },
              wells: {
                arrayValue: {
                  values: (payload.wells || []).map((w: any) => ({
                    mapValue: {
                      fields: {
                        name: { stringValue: w.name || '' },
                        operator: { stringValue: w.operator || '' },
                        county: { stringValue: w.county || '' },
                        jobType: { stringValue: w.jobType || '' },
                      },
                    },
                  })),
                },
              },
              locations: {
                arrayValue: {
                  values: (payload.locations || []).map((l: any) => ({
                    stringValue: typeof l === 'string' ? l : (l?.name || ''),
                  })),
                },
              },
              ppeOtherItems: {
                arrayValue: {
                  values: (payload.ppeOtherItems || []).map((p: string) => ({ stringValue: p })),
                },
              },
            };

            const resp = await fetch(docUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fields }),
            });
            if (!resp.ok) {
              const body = await resp.text().catch(() => '');
              console.warn(`[JSA] jsas/${payload.id} write failed: HTTP ${resp.status} ${body.slice(0, 200)}`);
              wbDiagLog({
                area: 'jsa',
                event: 'signoff.jsasWrite',
                source: 'signoff.saveAndGo',
                result: 'error',
                reason: `HTTP ${resp.status}`,
                driverHash,
                shiftId: shiftIdForPayload || undefined,
                operatorSlug: operatorSlug || undefined,
                extra: { jsaDocId: payload.id, status: resp.status },
              });
            } else {
              console.log(`[JSA] jsas/${payload.id} written with linkage (driverHash=${driverHash.slice(0, 8)}..., companyId=${companyId})`);
              wbDiagLog({
                area: 'jsa',
                event: 'signoff.jsasWrite',
                source: 'signoff.saveAndGo',
                result: 'ok',
                reason: 'jsas/{id} PATCH succeeded',
                driverHash,
                shiftId: shiftIdForPayload || undefined,
                operatorSlug: operatorSlug || undefined,
                counts: {
                  wells: (payload.wells || []).length,
                  locations: (payload.locations || []).length,
                },
                extra: { jsaDocId: payload.id, companyId },
              });
            }
          } catch (err) {
            console.warn('[JSA] jsas direct write error (non-fatal):', err);
            wbDiagLog({
              area: 'jsa',
              event: 'signoff.jsasWrite',
              source: 'signoff.saveAndGo',
              result: 'error',
              reason: (err as any)?.message || String(err).slice(0, 200),
              driverHash,
              shiftId: shiftIdForPayload || undefined,
              operatorSlug: operatorSlug || undefined,
              extra: { jsaDocId: payload.id, threw: true },
            });
          }
        }
      })();

      // NOTE: do NOT call router.dismissAll() here. Dismissing the stack
      // unmounts this signoff screen; subsequent setState calls on an
      // unmounted component are dropped silently, and the branded completion
      // modal never renders. Stack dismissal is deferred to the modal button
      // handlers (handleDoneStandalone / handleStayInJsa / handleReturnToOrigin).

      // Signal the home screen to reset its form on next focus. Without this,
      // rows the driver manually deleted pre-submit can come back after
      // navigating home (fetchJsaDayStatus stamped-wells merge path). Home
      // reads this flag, clears wells/locations/pusher/notes, then removes
      // the flag. Must be set BEFORE navigating away.
      try {
        await AsyncStorage.setItem('@jsa/clearFormOnNextFocus', '1');
      } catch {}

      // Also clear the same-day draft bridge key that the unfinished-modal
      // might otherwise use to re-populate the form.
      try { await AsyncStorage.removeItem('jsa_resume'); } catch {}

      // Resolve launch origin once, store on state, and show the branded
      // completion modal. Single modal replaces the prior double-confirm
      // (pre-submit Alert + post-submit Alert).
      let scheme: string | null = null;
      let origin: 'wbs' | 'wbt' | 'wbew' | 'standalone' = 'standalone';
      try {
        const returnTo = await AsyncStorage.getItem('jsa_returnTo');
        switch (returnTo) {
          case 'wbt':
          case 'wellbuilt-tickets':
            scheme = 'wellbuilt-tickets://'; origin = 'wbt'; break;
          case 'wbs':
          case 'wellbuilt-suite':
            scheme = 'wellbuilt-suite://'; origin = 'wbs'; break;
          case 'wellbuilt-ewallet':
            scheme = 'wellbuilt-ewallet://'; origin = 'wbew'; break;
          default:
            scheme = null; origin = 'standalone';
        }
      } catch (err) {
        console.warn('[JSA-Signoff] jsa_returnTo read failed, defaulting to standalone:', err);
      }
      console.log('[JSA-Signoff] saveAndGo complete — showing modal, origin:', origin);
      setCompleteReturnScheme(scheme);
      setCompleteOrigin(origin);
      setShowCompleteModal(true);
    };

    // Single-tap submit. The pre-submit confirmation Alert was removed —
    // the branded completion modal is the only confirmation surface now.
    // Wrap in a top-level catch so ANY failure in saveAndGo still surfaces
    // the modal (driver must not be stranded on signoff after tap).
    saveAndGo().catch((err) => {
      console.error('[JSA-Signoff] saveAndGo failed — forcing modal:', err);
      setCompleteReturnScheme(null);
      setCompleteOrigin('standalone');
      setShowCompleteModal(true);
    });
  };

  // Branded-modal action handlers.
  // Each handler is responsible for dismissing the steps → ppe → signoff
  // stack so Android back can't rewind to the just-submitted JSA. Deferred
  // from saveAndGo() — calling dismissAll earlier unmounts this screen
  // before the modal state flips, and the modal would never render.
  const dismissStack = () => {
    try { if (router.canDismiss()) router.dismissAll(); } catch {}
  };
  const handleStayInJsa = () => {
    // Staying — but PRESERVE jsa_returnTo so the persistent header chip on
    // the home screen can still deep-link back later.
    setShowCompleteModal(false);
    dismissStack();
    router.replace('/(tabs)');
  };
  const handleReturnToOrigin = async () => {
    setShowCompleteModal(false);
    await AsyncStorage.removeItem('jsa_returnTo').catch(() => {});
    dismissStack();
    if (completeReturnScheme) {
      try { await Linking.openURL(completeReturnScheme); }
      catch (err) {
        console.warn('[JSA] Return-to-origin deep link failed:', err);
        router.replace('/(tabs)');
      }
    } else {
      router.replace('/(tabs)');
    }
  };
  const handleDoneStandalone = () => {
    // Standalone exit — make sure the driver can always leave the JSA flow
    // cleanly. Dismiss stack, then replace to home tab.
    setShowCompleteModal(false);
    dismissStack();
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Review & Submit"),
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity onPress={() => router.replace("/(tabs)")}>
                <Text style={styles.headerLink}>{t("Home")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.replace("/(tabs)/history")}>
                <Text style={styles.headerLink}>{t("History")}</Text>
              </TouchableOpacity>
            </View>
          ),
          headerBackTitle: t("PPE Checklist"),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {/* Summary */}
          <JsaSummaryCard
            driverName={(params.driverName as string) || ''}
            truckNumber={(params.truckNumber as string) || ''}
            rows={summaryRows}
            date={(params.date as string) || ''}
          />

        {/* Prepared checklist */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("I am prepared for work")}</Text>
          {preparedItemsList.map((item) => (
            <View key={item.id} style={styles.checkRow}>
                <Switch
                  value={!!prepared[item.id]}
                  onValueChange={() => togglePrepared(item.id)}
                  thumbColor={prepared[item.id] ? accent : "#f4f3f4"}
                  trackColor={{ false: colors.border, true: accent + '40' }}
                />
                <Text style={styles.checkLabel}>{t(item.label)}</Text>
              </View>
            ))}
          </View>

          {emergencyContacts.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>{t("Emergency Contacts")}</Text>
              {emergencyContacts.map((contact) => (
                <View key={contact.id} style={styles.contactRow}>
                  <Text style={styles.contactLabel}>{contact.label}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
              ))}
            </View>
          )}

          {companyContacts.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.sectionTitle}>{t("Company Contacts")}</Text>
              {companyContacts.map((contact) => (
                <View key={contact.id} style={styles.contactRow}>
                  <Text style={styles.contactLabel}>{contact.label}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Notes */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Additional Notes")}</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder={t("Enter any notes")}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Signature */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Driver Signature")}</Text>
            {signatureImage ? (
              <View>
                <View style={{ backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 4, height: 80, justifyContent: 'center' }}>
                  <Image
                    source={{ uri: signatureImage.startsWith('data:') ? signatureImage : `data:image/png;base64,${signatureImage}` }}
                    // tintColor forces strokes to render black regardless of
                    // the capture source. Matches Settings preview (filter:brightness(0)).
                    style={{ width: '100%', height: 72, tintColor: '#000' }}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{signature || params.driverName}</Text>
                  <TouchableOpacity onPress={() => setShowSigModal(true)}>
                    <Text style={{ color: accent, fontSize: 13, fontWeight: '600' }}>{t("Re-sign")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setShowSigModal(true)}
                style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' }}
              >
                <Text style={{ color: accent, fontSize: 15, fontWeight: '600' }}>{t("Tap to Sign")}</Text>
              </TouchableOpacity>
            )}
            {/* Typed name fallback — always captured for record */}
            <TextInput
              style={[styles.input, { marginTop: 8 }]}
              placeholder={t("Print full name")}
              placeholderTextColor={colors.textMuted}
              value={signature}
              onChangeText={setSignature}
              returnKeyType="done"
            />
          </View>

          <SignatureModal
            visible={showSigModal}
            onClose={() => setShowSigModal(false)}
            onSave={(base64) => {
              setSignatureImage(base64);
              // Auto-fill typed name if empty
              if (!signature.trim() && params.driverName) {
                setSignature(params.driverName as string);
              }
            }}
            accent={accent}
          />

        <TouchableOpacity style={[styles.submitButton, { backgroundColor: accent }]} onPress={handleSubmit}>
          <Text style={styles.submitText}>{t("Submit JSA")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>

    {/* ── Branded completion modal (single post-submit surface) ─────── */}
    <Modal
      visible={showCompleteModal}
      transparent
      animationType="fade"
      onRequestClose={() => { /* blocked — one of the action buttons must be used */ }}
    >
      <View style={brandedModalStyles.backdrop}>
        <View style={brandedModalStyles.card}>
          <View style={[brandedModalStyles.header, { backgroundColor: accent }]}>
            <Text style={brandedModalStyles.headerTitle}>{t("JSA Submitted")}</Text>
          </View>
          <View style={brandedModalStyles.body}>
            <View style={[brandedModalStyles.checkCircle, { borderColor: accent }]}>
              <Text style={[brandedModalStyles.checkMark, { color: accent }]}>✓</Text>
            </View>
            <Text style={brandedModalStyles.bodyText}>
              {t("Your JSA has been submitted and saved.")}
            </Text>
            {completeOrigin !== 'standalone' ? (
              <Text style={brandedModalStyles.bodyTextSmall}>
                {completeOrigin === 'wbs' ? t("Launched from WellBuilt Suite.") :
                 completeOrigin === 'wbt' ? t("Launched from WellBuilt Tickets.") :
                 t("Launched from WellBuilt eWallet.")}
              </Text>
            ) : null}
          </View>
          <View style={brandedModalStyles.buttonRow}>
            {completeOrigin === 'standalone' ? (
              <TouchableOpacity
                style={[brandedModalStyles.primaryBtn, { backgroundColor: accent }]}
                onPress={handleDoneStandalone}
              >
                <Text style={brandedModalStyles.primaryBtnText}>{t("Done")}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={brandedModalStyles.secondaryBtn}
                  onPress={handleStayInJsa}
                >
                  <Text style={brandedModalStyles.secondaryBtnText}>{t("Stay on JSA")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[brandedModalStyles.primaryBtn, { backgroundColor: accent }]}
                  onPress={handleReturnToOrigin}
                >
                  <Text style={brandedModalStyles.primaryBtnText}>
                    {completeOrigin === 'wbs' ? t("Return to WB S") :
                     completeOrigin === 'wbt' ? t("Return to WB T") :
                     t("Return to WB eW")}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  </SafeAreaView>
  );
}

const brandedModalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  body: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  checkMark: {
    fontSize: 28,
    fontWeight: '900',
  },
  bodyText: {
    color: '#111',
    fontSize: 15,
    textAlign: 'center',
  },
  bodyTextSmall: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 18,
    paddingTop: 4,
  },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  secondaryBtnText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
});

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
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
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
  summaryRowValue: {
    color: colors.textDark,
    fontSize: 14,
    fontWeight: "600",
  },
  contactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  contactLabel: {
    color: colors.textDark,
    fontSize: 14,
    flex: 1,
  },
  contactPhone: {
    color: colors.textMuted,
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
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  checkLabel: {
    color: colors.textDark,
    fontSize: 14,
    flex: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.textDark,
    backgroundColor: colors.card,
  },
  multiline: {
    textAlignVertical: "top",
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  headerLink: {
    color: colors.primaryDark,
    fontWeight: "700",
    fontSize: 14,
    paddingHorizontal: 10,
  },
});
