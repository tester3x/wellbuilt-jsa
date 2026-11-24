import {signatureNeedsBlackInk} from '../services/signatureDisplay';
import {requireJsaSaveInformation} from '../services/jsaInformation';
import {HeaderBackButton} from '@react-navigation/elements';
import {usePreparedRead} from '../services/PreparedJsaFlow';
import { BrandedAlert as Alert } from '../services/brandedAlert';
import {useFormKeyboard} from '../components/useFormKeyboard';
import MoreMenu from '../components/MoreMenu';
import { jsaFlowFooterStyles as footer } from '../components/jsaFlowFooterStyles';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
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
import GovernedIsolationSurface from "../components/GovernedIsolationSurface";
import { redactRequestIds } from "../services/wbtReadRequest";
import SignatureModal from "../components/SignatureModal";
import { colors } from "../constants/colors";
import {
    JSA_STEPS,
    PREPARED_FOR_WORK_ITEMS,
    PPE_ITEMS,
} from "../constants/jsaTemplate";
import { STORAGE_KEYS } from "../constants/storageKeys";
import { fetchDriverProfile } from "../services/driverAuth";
import { wbDiagLog } from "../services/wbDiagLog";
import { allPreparationConfirmed, preparationAnswers, preparationChecks } from "../services/jsaPreparation";
import { useLanguage } from "./contexts/LanguageContext";
import { useTheme } from "./contexts/ThemeContext";

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
  date?: string;
  ppeSelected?: string;
  locations?: string;
  locationAcks?: string;
  jsaSessionId?: string;
  stepAcks?: string;
  stepsAcknowledged?: string;
};

export default function SignoffScreen() {
  const preparedRead=usePreparedRead();
  const [submitting, setSubmitting] = useState(false);
  const [reviewOpenedAt] = useState(() => new Date());
  const routeParams = useLocalSearchParams<Params>();
  const params = preparedRead?.params || routeParams;
  const router = useRouter();
  const { t, lang } = useLanguage();
  const locale = lang === 'es' ? 'es-MX' : 'en-US';
  const { emergencyContacts: themeEmergencyContacts, companyContacts: themeCompanyContacts, accent, jsaTemplate } = useTheme();
  const assessmentBundle=useMemo(()=>{try{return params.assessmentBundle?JSON.parse(params.assessmentBundle):null;}catch{return null;}},[params.assessmentBundle]);
  const formKeyboard=useFormKeyboard();
  const notesInputRef=useRef<TextInput>(null),nameInputRef=useRef<TextInput>(null);
  const preparedItemsList: {id:string;label:string}[] = assessmentBundle?.preparedItems ?? jsaTemplate?.preparedItems ?? PREPARED_FOR_WORK_ITEMS;

  // Contacts from company config (managed in Dashboard Settings > JSA)
  const emergencyContacts = themeEmergencyContacts.map((c, i) => ({ id: `ec-${i}`, ...c }));
  const companyContacts = themeCompanyContacts.map((c, i) => ({ id: `cc-${i}`, ...c }));

  const [preparedSelections, setPrepared] = useState<Record<string, boolean>>({});
  const prepared = useMemo(
    () => preparationAnswers(preparedItemsList, preparedSelections),
    [preparedItemsList, preparedSelections],
  );
  const preparationConfirmed = allPreparationConfirmed(preparedItemsList, prepared);
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const nameEditedRef = useRef(false);
  const profileLegalNameRef = useRef(false);
  const [validationNotice, setValidationNotice] = useState<{ message: string; focusName: boolean } | null>(null);
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [showSigModal, setShowSigModal] = useState(false);
  const isLoadedRef = useRef(false);

  // Branded post-submit modal. Shown ONCE after saveAndGo completes —
  // replaces the two-Alert double-confirm flow. Buttons adapt to launch origin.
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  // 8/6 honesty — true when the cloud submission did NOT finish: the
  // completion modal then says saved-on-device instead of claiming a
  // successful cloud submission (the old modal showed success even when
  // every cloud write failed).
  const [completeCloudPending, setCompleteCloudPending] = useState(false);
  const [completeOrigin, setCompleteOrigin] = useState<'wbs' | 'wbt' | 'wbew' | 'standalone'>('standalone');
  const [completeReturnScheme, setCompleteReturnScheme] = useState<string | null>(null);
  const completedRecordId=useRef<string|null>(null);
  const savedCopyRetryBusy = useRef(false);

  // Legal acknowledgment default is legalName only. Never displayName.
  useEffect(() => {
    (async () => {
      try {
        const { loadGovernedSession } = await import('../services/sso/jsaRuntime');
        const { legalAcknowledgmentName } = await import('../services/sso/jsaSession');
        const legal = legalAcknowledgmentName(await loadGovernedSession());
        if(legal && !nameEditedRef.current && !profileLegalNameRef.current){setGovernedPrintedName(legal);setSignature(legal);}
      } catch {}
    })();
  }, []);

  useEffect(()=>{
    const saved=preparedRead?.savedDraft;if(!saved)return;
    if(saved.notes)setNotes(saved.notes);
    if(saved.printedName){nameEditedRef.current=true;setGovernedPrintedName(saved.printedName);setSignature(saved.printedName);}
    if(saved.signature)setSignatureImage(saved.signature);
  },[preparedRead?.savedDraft]);

  // Pre-load drawn signature from Firebase profile (same as WB T / WB S)
  useEffect(() => {
    (async () => {
      try {
        const profile = await fetchDriverProfile();
        if(profile?.legalName?.trim() && !nameEditedRef.current){profileLegalNameRef.current=true;setGovernedPrintedName(profile.legalName.trim());setSignature(profile.legalName.trim());}
        if (profile?.signature && !preparedRead?.savedDraft?.signature) {
          setSignatureImage(profile.signature);
          console.log('[JSA-Signoff] Pre-loaded signature from Firebase profile');
        }
      } catch (err) {
        console.warn('[JSA-Signoff] Failed to load signature:', err);
      }
    })();
  }, [preparedRead?.savedDraft?.signature]);

  // Parse wells and locations passed from previous screen
  // Parse wells — supports both old (string[]) and new (WellEntry[]) formats
  const [jobWellsJson, setJobWellsJson] = useState('[]');
  const [jobWellName, setJobWellName] = useState('');
  const [jobActivityResolved, setJobActivityResolved] = useState('');
  const [jobGate, setJobGate] = useState<'pending' | 'ready' | 'failed'>('pending');
  const [jobSource, setJobSource] = useState<'governed_snapshot' | 'nav_params' | null>(null);
  const [attestScope, setAttestScope] = useState<{ kind: 'governed' | 'standalone'; scopeId: string } | null>(null);
  const [stepAcks, setStepAcks] = useState<Record<string, boolean>>({});
  const [stepsAcknowledged, setStepsAcknowledged] = useState(false);
  const [governedPrintedName, setGovernedPrintedName] = useState('');
  const submitLockRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      isLoadedRef.current = false;
      try {
        const { resolveGovernedJobHandoff } = await import('../services/sso/jsaGovernedJobLive');
        const { decideGovernedJobScreen, jobWorkflowMayAdvance } = await import('../services/sso/jsaGovernedJobFields');
        const { populate, handoff } = await (preparedRead?.resolve || resolveGovernedJobHandoff)({
          wellsParam: (params.wells as string) || '[]',
          wellNameParam: (params.wellName as string) || '',
          jobActivityParam: (params.jobActivityName as string) || '',
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
          standaloneSessionId: typeof params.jsaSessionId === 'string' ? params.jsaSessionId : '',
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
          setPrepared(draft.prepared);
          setStepAcks(draft.stepAcks);
          setStepsAcknowledged(draft.stepsAcknowledged === true);
          setAttestScope(scopeDec.scope);
        } else {
          setPrepared({});
          setStepAcks({});
          setStepsAcknowledged(false);
          setAttestScope(null);
        }
        isLoadedRef.current = true;
        setJobWellsJson(handoff.wells);
        setJobWellName(handoff.wellName);
        setJobActivityResolved(handoff.jobActivityName);
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
  }, [params.wells, params.wellName, params.jobActivityName, params.jsaSessionId, router, preparedRead?.resolve]);

  const wellsList = useMemo(() => {
    try {
      const parsed = JSON.parse(jobWellsJson);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // ignore
    }
    return [];
  }, [jobWellsJson]);

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
        jobActivityName: jobActivityResolved,
        task: jobSource === 'nav_params' ? (params.task as string | undefined) : jobActivityResolved,
      },
    )
  ), [wellsList, locations, jobActivityResolved, jobSource, params.task]);

  const togglePrepared = (id: string) => {
    setPrepared((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  useEffect(() => {
    if (!isLoadedRef.current || !attestScope || jobGate !== 'ready') return;
    void import('../services/sso/jsaAttestationScope').then(({ writeAttestationDraft }) => {
      writeAttestationDraft(AsyncStorage, attestScope, { prepared }).catch((error) =>
        console.warn("Failed to save prepared toggles", error)
      );
    });
  }, [prepared, attestScope, jobGate]);

  const handleSubmit = () => {
    if (jobGate !== 'ready' || !jobSource) return;
    if (submitLockRef.current) return;
    if (!preparationConfirmed) {
      setValidationNotice({ focusName: false,
        message: t("Confirm every prepared-for-work item before submitting.") });
      return;
    }
    // Validation: Drawn signature required
    if (!signatureImage) {
      setValidationNotice({ focusName: false,
        message: t("Please sign before submitting. Tap the signature area to draw your signature.") });
      return;
    }

    let skipForcedSubmitted = false;
    let localSaveCommitted = false;
    const saveAndGo = async () => {
      if (jobGate !== 'ready' || !jobSource) return;
      // Parse PPE into structured format for JSARecord
      let ppeObj: Record<string, boolean> = {};
      let ppeOtherItems: string[] = [];
      try {
        const parsed = params.ppeSelected ? JSON.parse(params.ppeSelected as string) : {};
        if (parsed?.selected) { ppeObj = parsed.selected; ppeOtherItems = parsed.otherItems || []; }
        else if (typeof parsed === 'object' && !Array.isArray(parsed)) ppeObj = parsed;
      } catch {}

      if(preparedRead){
        const required=preparedRead.assessment.steps.map((step:{id:string})=>step.id);
        if(!governedPrintedName.trim() || required.some((id:string)=>stepAcks[id]!==true)){
          skipForcedSubmitted=true;setValidationNotice({focusName:!governedPrintedName.trim(),message:t(!governedPrintedName.trim()?'Legal name is required':'Please review all steps before continuing.')});return;
        }
        const returnUrl=await preparedRead.submit({prepared,locationAcks:{},locations:[],stepsAcknowledged:true,stepAcks,
          ppeSelected:ppeObj,ppeOtherItems,notes:notes.trim(),pusher:params.pusher||'',otherInfo:params.otherInfo||'',
          printedName:governedPrintedName.trim(),signature:{mimeType:'image/png',data:signatureImage!.replace(/^data:image\/png;base64,/, '')},
          truckNumber:params.truckNumber||'',formDate:params.date||''});
        setCompleteCloudPending(true);setCompleteOrigin('wbt');setCompleteReturnScheme(returnUrl);setShowCompleteModal(true);return;
      }

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
      const wellsForSaveRaw = wellsList.map((w: any) => {
        if (typeof w === 'string') {
          return { name: w, operator: '', county: '', jobType: canonicalActivity };
        }
        const existing = (typeof w.jobType === 'string' ? w.jobType : '').trim();
        return { ...w, jobType: existing || canonicalActivity };
      });
      const { freezeGovernedJobForSave } = await import('../services/sso/jsaGovernedJobFields');
      const { resolveGovernedJobHandoff } = await import('../services/sso/jsaGovernedJobLive');
      const resolved = await resolveGovernedJobHandoff({
        wellsParam: JSON.stringify(wellsForSaveRaw),
        wellNameParam: jobWellName,
        jobActivityParam: jobActivityResolved,
      });
      const { decideGovernedJobScreen, pendingGovernedReadMaySave } =
        await import('../services/sso/jsaGovernedJobFields');
      const dest = decideGovernedJobScreen(resolved.populate);
      if (dest === 'completed') {
        const { resolveCompletedTerminalHref } = await import('../services/sso/jsaGovernedRoute');
        router.replace((await resolveCompletedTerminalHref()) as any);
        return;
      }
      if (dest === 'acknowledge') {
        router.replace('/acknowledge' as any);
        return;
      }
      if (dest === 'fail' || resolved.handoff.source === 'blocked') {
        Alert.alert(
          t('Cannot complete') || 'Cannot complete',
          'This JSA request is not valid. Return to WellBuilt Tickets and launch again.',
        );
        return;
      }
      if (resolved.hasLaunch && !pendingGovernedReadMaySave(resolved.handoff)) {
        return;
      }
      const frozenJob = freezeGovernedJobForSave({
        populate: resolved.populate,
        wells: wellsForSaveRaw,
        wellName: jobWellName,
        jobActivityName: jobActivityResolved,
      });
      if (frozenJob.source !== 'governed_snapshot' && frozenJob.source !== 'nav_params') {
        return;
      }
      const { loadGovernedSession } = await import('../services/sso/jsaRuntime');
      const { legalAcknowledgmentName } = await import('../services/sso/jsaSession');
      const { decideGovernedSubmitEvidence } = await import('../services/sso/jsaGovernedFormEvidence');
      const requiredStepIds = (params.assessmentSteps ? JSON.parse(params.assessmentSteps) : (jsaTemplate?.steps ?? JSA_STEPS)).map((s: { id: string }) => s.id);
      const submitEvidence = decideGovernedSubmitEvidence({
        source: frozenJob.source,
        legalName: legalAcknowledgmentName(await loadGovernedSession()),
        typedLegalName: governedPrintedName,
        standalonePrintedName: signature,
        signatureImage,
        requiredStepIds,
        stepAcks,
        stepsAcknowledged,
      });
      if (submitEvidence.kind === 'fail_closed') {
        setValidationNotice({ focusName: submitEvidence.reason === 'missing_legal_name', message:
          submitEvidence.reason === 'missing_legal_name'
            ? (t('Legal name is required') || 'Legal name is required to submit this JSA.')
            : submitEvidence.reason === 'missing_step_evidence'
              ? (t('Please review all steps before continuing.') || 'Please review all steps before continuing.')
              : (t('Signature Required') || 'Please sign before submitting.'),
        });
        return;
      }
      const printedNameForSave = submitEvidence.printedName;
      const stepAcksForSave = submitEvidence.stepAcks;
      const stepsAcknowledgedForSave = submitEvidence.stepsAcknowledged;
      const { finalizeSaveActivityFields } = await import('../services/sso/jsaGovernedJobFields');
      const activityFields = finalizeSaveActivityFields({
        source: frozenJob.source,
        frozenJobActivityName: frozenJob.jobActivityName,
        frozenWellName: frozenJob.wellName,
        frozenWells: frozenJob.wells,
        canonicalActivity,
        paramsTask,
        standaloneWellName: jobWellName || (params.wellName as string) || '',
        standaloneWells: wellsForSaveRaw,
      });
      const wellsForSave = activityFields.wells;
      const wellNameForSave = activityFields.wellName;
      const activityForSave = activityFields.jobActivityName;
      const taskForSave = activityFields.task;

      // Resolve session up front so linkage fields land in BOTH the local
      // AsyncStorage save (replayed by syncToCloud) AND the direct Firestore
      // writes below. Historically the jsas collection docs had no driverHash
      // at all, so "all JSAs by Mike" couldn't be queried server-side.
      const sessionForPayload = await (await import('../services/sso/jsaGovernedAuthLive')).loadUsableGovernedSession();
      if (!sessionForPayload) throw new Error('Sign in to WellBuilt JSA first.');
      const independent = !resolved.hasLaunch && frozenJob.source === 'nav_params';
      if (independent && !await (await import('../services/standaloneJsa')).standaloneAccess()) throw new Error('Company JSA access is unavailable.');
      const driverHashForPayload = sessionForPayload?.driverId || '';
      const companyIdForPayload =
        sessionForPayload?.companyId
        || (await AsyncStorage.getItem('selectedCompanyId').catch(() => null))
        || '';
      const driverLegalNameForPayload =
        (sessionForPayload?.legalName && sessionForPayload.legalName.trim())
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
      // Governed work uses only the verified session's optional shift association.
      // A calendar day and a stale local cache are never a shift identifier.
      const governedBinding = resolved.hasLaunch ? (await loadGovernedSession())?.binding : null;
      const shiftIdInStorage = independent ? null : resolved.hasLaunch
        ? governedBinding?.shiftState === 'open' ? governedBinding.periodId || null : null
        : await AsyncStorage.getItem('wellbuilt-current-shift-id').catch(() => null);
      const dateForPayload = new Date().toISOString().slice(0, 10);
      const scopeSource: 'shiftId' | 'date' | 'none' = shiftIdInStorage ? 'shiftId' : resolved.hasLaunch ? 'none' : 'date';
      const shiftIdForPayload = shiftIdInStorage || (resolved.hasLaunch ? '' : dateForPayload);

      // operator — scopes the JSA WITHIN a shift. A driver running for two
      // oil companies in one shift gets two distinct JSAs. Source order:
      // protected well's operator field; standalone forms may use their selected
      // operator param. Governed launches never trust operator URL hints.
      const operatorForPayload = (() => {
        if(independent && params.operator?.trim())return params.operator.trim();
        const fromWell = (wellsForSave as any[]).find((w: any) => typeof w?.operator === 'string' && w.operator.trim())?.operator;
        if (fromWell) return String(fromWell).trim();
        const fromParam = !resolved.hasLaunch && typeof (params as any).operator === 'string' ? (params as any).operator.trim() : '';
        return fromParam;
      })();
      requireJsaSaveInformation({operator:operatorForPayload,wells:wellsForSave,wellName:wellNameForSave,locations});
      const operatorSlug = operatorForPayload
        ? operatorForPayload.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        : '';
      const scopeForPayload = operatorSlug ? `${shiftIdForPayload}__${operatorSlug}` : shiftIdForPayload;

      const { loadRequestContext, loadPendingComplete } = await import('../services/sso/jsaRuntime');
      const { governedRecordLink, terminalActionForIntent } = await import('../services/sso/jsaRequestLifecycle');
      const { commitGovernedAfterLocalSave } = await import('../services/sso/jsaArtifactLive');
      const { adaptGovernedSnapshot } = await import('../services/sso/jsaArtifactSnapshot');
      const { decideGovernedReturn } = await import('../services/sso/jsaReturn');
      const { failClosedCopy } = await import('../services/sso/jsaRequestLifecycle');
      const governedCtx = resolved.hasLaunch ? await loadRequestContext() : null;
      const pendingComplete = await loadPendingComplete();
      skipForcedSubmitted = !!governedCtx;
      if (governedCtx?.state === 'completed' && governedCtx.action) {
        const { resolveCompletedTerminalHref } = await import('../services/sso/jsaGovernedRoute');
        router.replace((await resolveCompletedTerminalHref(true)) as any);
        return;
      }
      const governedActive = !!governedCtx && governedCtx.state === 'pending';
      const governedAction = governedActive
        ? terminalActionForIntent(governedCtx.intent)
        : null;

      const legacyBinding = !governedActive && !independent
        ? await (await import('../services/wbtReadRequest')).loadReadRequestContext() : null;
      const payload = {
        ...(legacyBinding ? {legacyReceiptBinding: legacyBinding} : {}),
        ...(assessmentBundle?.packageId ? { packageId: assessmentBundle.packageId } : {}),
        assessmentPpeItems: assessmentBundle?.ppeItems ?? jsaTemplate?.ppeItems ?? PPE_ITEMS,
        assessmentPreparedItems: preparedItemsList,
        assessmentSteps: params.assessmentSteps ? JSON.parse(params.assessmentSteps) : [],
        ...(!assessmentBundle&&jsaTemplate?.locationLayout?{locationLayout:jsaTemplate.locationLayout}:{}),
        ...(assessmentBundle ? {templateRefs:assessmentBundle.templateRefs,assessmentTemplates:assessmentBundle.templates,assessmentPpeItems:assessmentBundle.ppeItems,assessmentPreparedItems:assessmentBundle.preparedItems,...(assessmentBundle.locationLayout?{locationLayout:assessmentBundle.locationLayout}:{})}:{}),
        id: (pendingComplete && governedActive && pendingComplete.requestId === governedCtx.requestId)
          ? pendingComplete.localRecordId
          : independent ? `standalone_${String(params.jsaSessionId || Date.now())}` : legacyBinding ? `legacy_${legacyBinding.requestId}` : Date.now().toString(),
        timestamp: new Date().toISOString(),
        driverName: params.driverName ?? "",
        // Linkage fields — required for server-side queries by driver.
        driverHash: driverHashForPayload,
        driverId: driverHashForPayload,
        driverLegalName: driverLegalNameForPayload,
        companyId: companyIdForPayload,
        shiftId: independent || resolved.hasLaunch && !shiftIdInStorage ? null : shiftIdForPayload,
        ...(independent ? { workflow: 'standalone' } : {}),
        operator: operatorForPayload,
        operatorSlug,
        scope: scopeForPayload,
        createdAt: new Date().toISOString(),
        truckNumber: params.truckNumber ?? "",
        jobActivityName: activityForSave,
        pusher: params.pusher ?? "",
        wellName: wellNameForSave,
        wells: wellsForSave,
        otherInfo: params.otherInfo ?? "",
        location: params.location ?? "",
        task: taskForSave,
        date: params.date ?? "",
        ppeSelected: ppeObj,
        ppeOtherItems,
        ppeSelectedRaw: params.ppeSelected ?? "", // keep for completed screen params
        locations,
        locationAcks,
        prepared,
        notes,
        signature: printedNameForSave,
        signatureImage: signatureImage || '',
        stepAcks: stepAcksForSave,
        stepsAcknowledged: stepsAcknowledgedForSave,
        ...(governedActive ? governedRecordLink(governedCtx.requestId) : {}),
        ...(governedActive && governedAction ? {
          governedSubmitCommit: {
            committed: true,
            committedAtMs: Date.now(),
            action: governedAction,
          },
        } : {}),
      };
      const { applyGovernedLocalSave } = await import('../services/sso/jsaArtifactSnapshot');
      let payloadForComplete = payload;
      completedRecordId.current=payload.id;
      let localSaveOk = false;
      if (governedActive && governedCtx) {
        try {
          const existing = await AsyncStorage.getItem(STORAGE_KEYS.saves);
          const list = existing ? JSON.parse(existing) : [];
          const applied = applyGovernedLocalSave(
            Array.isArray(list) ? list : [],
            governedCtx.requestId,
            payload,
          );
          if (applied.created) {
            await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(applied.saves));
          }
          payloadForComplete = applied.record as typeof payload;
          localSaveOk = true;
        } catch (error) {
          console.warn("Failed to save JSA", error);
          localSaveOk = false;
        }
      } else {
        try {
          const existing = await AsyncStorage.getItem(STORAGE_KEYS.saves);
          const list = existing ? JSON.parse(existing) : [];
          const retained = (independent || legacyBinding) && Array.isArray(list) ? list.find((x:any)=>x.id===payload.id && x.driverId===payload.driverId && x.companyId===payload.companyId) : null;
          if (retained) payloadForComplete = retained;
          const nextList = retained ? list : Array.isArray(list) ? [payload, ...list] : [payload];
          await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(nextList));
          localSaveOk = true;
        } catch (error) {
          console.warn("Failed to save JSA", error);
          localSaveOk = false;
        }
      }
      if (!localSaveOk) {
        Alert.alert(
          t('Not saved') || 'Not saved',
          t(failClosedCopy('local_save_failed')),
        );
        return;
      }

      localSaveCommitted = true;

      // Mark this JSA as dismissed from the home-screen active tabs.
      // Submitted JSAs live in Saved JSAs; they shouldn't auto-rehydrate as tabs.
      try {
        const raw = await AsyncStorage.getItem('@jsa/dismissedIds');
        const ids: string[] = raw ? JSON.parse(raw) : [];
        if (!ids.includes(payloadForComplete.id)) ids.push(payloadForComplete.id);
        await AsyncStorage.setItem('@jsa/dismissedIds', JSON.stringify(ids));
        // Also drop any active tab matching this id so this session clears it instantly
        const activeRaw = await AsyncStorage.getItem('@jsa/activeJsas');
        if (activeRaw) {
          const active = JSON.parse(activeRaw);
          if (Array.isArray(active)) {
            const filtered = active.filter((j: any) => j?.id !== payloadForComplete.id);
            await AsyncStorage.setItem('@jsa/activeJsas', JSON.stringify(filtered));
          }
        }
      } catch {}

      // Governed get/complete: local detailed record is already durable.
      // Author the server terminal receipt only after that save. Retry
      // does not create a second JSA.
      if (governedActive && governedCtx && governedAction) {
        const launch = await (await import('../services/sso/jsaRuntime')).loadLaunchContext();
        const adapted = adaptGovernedSnapshot(payloadForComplete);
        if (!adapted.ok) {
          Alert.alert(
            t('Cannot complete') || 'Cannot complete',
            t(failClosedCopy('malformed')),
          );
          return;
        }
        const done = await commitGovernedAfterLocalSave({
          requestId: governedCtx.requestId,
          action: governedAction,
          localRecordId: payloadForComplete.id,
          snapshot: adapted.value,
          localSaveOk,
        });
        if (done.kind === 'pending_retry') {
          Alert.alert(
            done.completionRecorded ? t('Signed copy still syncing') : t('Completion not confirmed'),
            t(done.copy),
            [
              {
                text: t('Retry') || 'Retry',
                onPress: () => { void (async () => {
                  if (savedCopyRetryBusy.current) return;
                  savedCopyRetryBusy.current = true;
                  setSubmitting(true);
                  try {
                    const { retrySavedGovernedArtifact } = await import('../services/sso/jsaArtifactLive');
                    await retrySavedGovernedArtifact(governedCtx.requestId);
                    // Reopening the terminal checks the owner-bound saved-copy
                    // queue. It offers Retry until archived, never another read/sign.
                    router.replace({ pathname: '/governed-status', params: { mode: 'completed', action: governedAction } } as any);
                  } catch {
                    Alert.alert(t('Signed copy still syncing'), t(done.copy));
                  } finally { savedCopyRetryBusy.current = false; setSubmitting(false); }
                })(); },
              },
              { text: t('OK') || 'OK' },
            ],
          );
          return;
        }
        if (done.kind === 'fail_closed') {
          Alert.alert(
            t('Cannot complete') || 'Cannot complete',
            t(done.copy),
          );
          return;
        }
        try { await AsyncStorage.setItem('@jsa/clearFormOnNextFocus', '1'); } catch {}
        try { await AsyncStorage.removeItem('jsa_resume'); } catch {}
        if (attestScope) {
          try {
            const { applyAttestationCompletion } = await import('../services/sso/jsaAttestationScope');
            await applyAttestationCompletion(AsyncStorage, attestScope, 'succeeded');
          } catch {}
        }
        const { recordFreshGovernedSubmitted } = await import('../services/sso/jsaRuntime');
        await recordFreshGovernedSubmitted(governedCtx.requestId, done.action);
        const { resolveCompletedTerminalHref } = await import('../services/sso/jsaGovernedRoute');
        router.replace((await resolveCompletedTerminalHref(done.reused)) as any);
        return;
      }

      // WB-T fresh-read RECEIPT context (8/6): resolved ONCE at submit.
      // A usable context makes this a receipt-backed submission — success
      // UI is then gated on AWAITED core persistence + receipt. An
      // expired/absent context runs the ordinary flow (and is cleared so
      // it can never be satisfied by a later unrelated submission).
      const { loadReadRequestContext, isReadRequestContextUsable, clearReadRequestContext, writeReadReceipt } = await import('../services/wbtReadRequest');
      const readCtxAtSubmit = independent ? null : await loadReadRequestContext();
      const receiptFlow = isReadRequestContextUsable(readCtxAtSubmit, Date.now());
      if (readCtxAtSubmit && !receiptFlow) {
        console.warn('[JSA][wbtReadRequest] stored request expired before submit — ordinary flow, no receipt');
        await clearReadRequestContext();
      }

      // Historical signed evidence is archived through an authenticated,
      // create-once callable. The frozen local original is never augmented or
      // overwritten during retry. Governed/native submissions returned above.
      // PDF and day-status projections are not proof of signed persistence.
      let coreJsasOk = false;
      const runCloudPersist = async (): Promise<{ jsasOk: boolean }> => {
        if (independent) {
          const saved = await (await import('../services/standaloneJsa')).persistStandaloneJsa(payloadForComplete);
          return { jsasOk: !!saved?.record?.id };
        }
        try {
          await (await import('../services/legacyEvidence')).persistLegacyJsaEvidence(payloadForComplete);
          coreJsasOk = true;
          return { jsasOk: coreJsasOk };
        } catch {
          // The frozen local signed record is the retry source. A rejection or
          // transport failure never authorizes mutation, reassignment or loss.
          return { jsasOk: false };
        }
      };

      // ── Receipt-backed flow: AWAIT core submission, then the receipt ──
      // Success UI and the return link exist ONLY after BOTH durable
      // writes land. Failure keeps the driver on signoff with the entered
      // form + signature intact and an honest Retry (same payload id →
      // idempotent jsas PATCH; GET-first receipt → no duplicates). The
      // request context is cleared only after the receipt persists.
      if (receiptFlow && readCtxAtSubmit) {
        // vc51.9B: a v2 request demands the canonical period proof BEFORE
        // any receipt — the submission's period is resolved independently
        // through @tester3x/wellbuilt-contracts (deep-link fields are wake
        // hints, never authority) and must equal the request's period.
        // Any mismatch/closed/unverified verdict → no receipt, honest
        // retry. v1 requests keep the legacy inert path.
        const proveV2Binding = async () => {
          if (readCtxAtSubmit.receiptVersion !== 2) return { ok: true as const, binding: undefined };
          const { resolveSubmissionPeriod, validateRequestPeriodBinding } =
            await import('../services/requestPeriodBinding');
          const mode = readCtxAtSubmit.workPeriodMode ?? 'explicit_shift';
          const now = new Date();
          const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const cachedShiftId = await AsyncStorage.getItem('wellbuilt-current-shift-id');
          const resolution = await resolveSubmissionPeriod({
            companyId: readCtxAtSubmit.companyId,
            driverHash: readCtxAtSubmit.driverHash,
            mode,
            nowMs: now.getTime(),
            localDate,
            cachedShiftId,
            fetchDayDoc: async (date: string) => {
              try {
                const url = `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/driver_shifts/${readCtxAtSubmit.driverHash}_${date}?key=AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI`;
                const resp = await fetch(url);
                if (resp.status === 404) return { readable: true, present: false };
                if (!resp.ok) return { readable: false, present: false };
                const docJson = await resp.json();
                const raw = docJson?.fields?.currentShiftId?.stringValue;
                return { readable: true, present: true, ...(typeof raw === 'string' ? { currentShiftId: raw } : {}) };
              } catch {
                return { readable: false, present: false };
              }
            },
          }).catch(() => null);
          const verdictResult = validateRequestPeriodBinding(
            {
              receiptVersion: 2,
              contractVersion: readCtxAtSubmit.requestContractVersion ?? 1,
              companyId: readCtxAtSubmit.companyId,
              driverHash: readCtxAtSubmit.driverHash,
              periodId: readCtxAtSubmit.periodId,
              workPeriodMode: readCtxAtSubmit.workPeriodMode,
            },
            { companyId: readCtxAtSubmit.companyId, driverHash: readCtxAtSubmit.driverHash },
            resolution,
          );
          if (!verdictResult.ok) {
            console.warn(`[JSA][wbtReadRequest] v2 period binding refused: ${verdictResult.reason}`);
            return { ok: false as const, binding: undefined };
          }
          return {
            ok: true as const,
            binding: verdictResult.receiptVersion === 2
              ? { submissionPeriodId: verdictResult.submissionPeriodId, workPeriodMode: verdictResult.workPeriodMode }
              : undefined,
          };
        };
        const attemptReceiptPersist = async (): Promise<boolean> => {
          coreJsasOk = false;
          const core = await runCloudPersist().catch(() => ({ jsasOk: false }));
          if (!core.jsasOk) return false;
          const proof = await proveV2Binding();
          if (!proof.ok) return false;
          const receiptOk = await writeReadReceipt(readCtxAtSubmit, payload.id, proof.binding);
          if (!receiptOk) return false;
          await clearReadRequestContext();
          return true;
        };
        const succeed = async () => {
          try { await AsyncStorage.setItem('@jsa/clearFormOnNextFocus', '1'); } catch {}
          try { await AsyncStorage.removeItem('jsa_resume'); } catch {}
          if (attestScope) {
            try {
              const { applyAttestationCompletion } = await import('../services/sso/jsaAttestationScope');
              await applyAttestationCompletion(AsyncStorage, attestScope, 'succeeded');
            } catch {}
          }
          setCompleteCloudPending(false);
          setCompleteReturnScheme(
            `wellbuilt-tickets://jsa-return?requestId=${encodeURIComponent(readCtxAtSubmit.requestId)}&version=${readCtxAtSubmit.receiptVersion === 2 ? 2 : 1}`,
          );
          setCompleteOrigin('wbt');
          setShowCompleteModal(true);
        };
        const failHonestly = () => {
          Alert.alert(
            t('Submission Not Complete') || 'Submission Not Complete',
            t('Your JSA could not be saved to the cloud yet, so WB Tickets cannot verify it. Check connectivity and tap Retry — your entries and signature are kept.')
              || 'Your JSA could not be saved to the cloud yet, so WB Tickets cannot verify it. Check connectivity and tap Retry — your entries and signature are kept.',
            [
              {
                text: t('Retry') || 'Retry',
                onPress: () => { void attemptReceiptPersist().then((ok) => (ok ? succeed() : failHonestly())); },
              },
              { text: t('OK') || 'OK' },
            ],
          );
        };
        const ok = await attemptReceiptPersist();
        if (ok) { await succeed(); } else { failHonestly(); }
        return; // receipt flow fully handled — no fall-through success
      }

      // Ordinary flow (8/6 honesty) — the smallest awaited boundary: the
      // core jsas write. The local save above is already durable; the
      // completion modal now tells the truth about the cloud outcome
      // instead of claiming success while every write failed. Ancillary
      // writes stay best-effort inside the closure.
      {
        const core = await runCloudPersist().catch(() => ({ jsasOk: false }));
        setCompleteCloudPending(!core.jsasOk);
        if (!core.jsasOk) {
          console.warn('[JSA-Signoff] core cloud write did not finish — modal shows saved-on-device');
        }
      }

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
      if (localSaveOk && attestScope) {
        try {
          const { applyAttestationCompletion } = await import('../services/sso/jsaAttestationScope');
          await applyAttestationCompletion(AsyncStorage, attestScope, 'succeeded');
        } catch {}
      }

      // Resolve launch origin once, store on state, and show the branded
      // completion modal. Single modal replaces the prior double-confirm
      // (pre-submit Alert + post-submit Alert).
      let scheme: string | null = null;
      let origin: 'wbs' | 'wbt' | 'wbew' | 'standalone' = 'standalone';
      try {
        const returnTo = independent ? null : await AsyncStorage.getItem('jsa_returnTo');
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
    submitLockRef.current = true;
    setSubmitting(true);
    saveAndGo().catch((err) => {
      console.error('[JSA-Signoff] saveAndGo failed:', err);
      if (!localSaveCommitted) {
        setValidationNotice({focusName:false,message:err instanceof Error?err.message:String(err)});
        return;
      }
      if (skipForcedSubmitted) return;
      if(preparedRead){setValidationNotice({focusName:false,message:err instanceof Error?err.message:String(err)});return;}
      // 8/6 — the forced modal no longer claims success: cloudPending copy
      // renders (the local save is the first step and is best-effort
      // durable); no return link, no receipt, WB-T stays gated.
      setCompleteCloudPending(true);
      setCompleteReturnScheme(null);
      setCompleteOrigin('standalone');
      setShowCompleteModal(true);
    }).finally(() => {
      submitLockRef.current = false;
      setSubmitting(false);
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
  // Map completion-modal origin to the structured action label that goes
  // into the jsa.returnRouting diagnostic. Single source of truth so the
  // three handlers below all emit consistent event payloads.
  const routeAction = (
    handler: 'stay' | 'return' | 'done'
  ): 'return_to_wbt' | 'return_to_wbs' | 'return_to_wbew' | 'stay_in_jsa' | 'standalone' => {
    if (handler === 'stay') return 'stay_in_jsa';
    if (handler === 'done') return 'standalone';
    if (completeOrigin === 'wbt') return 'return_to_wbt';
    if (completeOrigin === 'wbs') return 'return_to_wbs';
    if (completeOrigin === 'wbew') return 'return_to_wbew';
    return 'standalone';
  };

  const handleStayInJsa = async () => {
    await (await import('../services/jsaStayReturn')).rememberJsaStay(completeReturnScheme);
    await (await import('../services/sso/jsaRuntime')).consumeGovernedLaunchAfterStay();
    // Staying — but PRESERVE jsa_returnTo so the persistent header chip on
    // the home screen can still deep-link back later.
    wbDiagLog({
      area: 'jsa',
      event: 'jsa.returnRouting',
      source: 'signoff.handleStayInJsa',
      result: 'ok',
      reason: 'driver chose to stay in WB JSA — origin preserved for later return chip',
      extra: {
        origin: completeOrigin,
        // vc51.5 — receipt-flow schemes carry the nonce; redacted for diag.
        returnTo: completeReturnScheme ? redactRequestIds(completeReturnScheme) : null,
        action: routeAction('stay'),
      },
    });
    setShowCompleteModal(false);
    dismissStack();
    router.replace('/(tabs)');
  };
  const handleReturnToOrigin = async () => {
    const action = routeAction('return');
    // vc51.5 leakage audit — for receipt flows the return scheme carries
    // the read-receipt nonce; diagnostics get the redacted form only.
    const safeScheme = completeReturnScheme ? redactRequestIds(completeReturnScheme) : null;
    wbDiagLog({
      area: 'jsa',
      event: 'jsa.returnRouting',
      source: 'signoff.handleReturnToOrigin',
      result: completeReturnScheme ? 'ok' : 'skipped',
      reason: safeScheme
        ? `opening ${safeScheme} to return to ${completeOrigin}`
        : 'no return scheme — fallback to home tabs',
      extra: {
        origin: completeOrigin,
        returnTo: safeScheme,
        action,
      },
    });
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
    wbDiagLog({
      area: 'jsa',
      event: 'jsa.returnRouting',
      source: 'signoff.handleDoneStandalone',
      result: 'ok',
      reason: 'standalone exit — no origin app',
      extra: {
        origin: 'standalone',
        returnTo: null,
        action: routeAction('done'),
      },
    });
    setShowCompleteModal(false);
    dismissStack();
    router.replace(completedRecordId.current?({pathname:'/jsa-record',params:{id:completedRecordId.current}} as any):'/(tabs)');
  };

  if (jobGate !== 'ready') {
    return (
      <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safeArea}>
        <GovernedIsolationSurface kind="connecting" variant="overlay" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safeArea}>
      <Stack.Screen
        options={{
          title: t("Review & Submit"),
          headerRight: () => <MoreMenu />,
          ...(preparedRead ? {headerLeft:()=> <HeaderBackButton tintColor="#fff" onPress={preparedRead.back} />} : {}),
          headerBackTitle: t("PPE Checklist"),
        }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <ScrollView
          ref={formKeyboard.scrollRef}
          {...formKeyboard.scrollProps}
          style={styles.container}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          contentContainerStyle={[styles.content,{paddingBottom:8+formKeyboard.height}]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {/* Summary */}
          <JsaSummaryCard compact
            driverName={(params.driverName as string) || ''}
            truckNumber={(params.truckNumber as string) || ''}
            rows={summaryRows}
            date={(params.date as string) || ''}
          />

        {/* Prepared checklist */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("I am prepared for work")}</Text>
          {preparationChecks(preparedItemsList).map((item) => (
            <View key={item.id} style={styles.checkRow}>
                <Switch
                  accessibilityLabel={t(item.label)}
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
              ref={notesInputRef}
              onFocus={()=>formKeyboard.focus(notesInputRef.current)}
              style={[styles.input, styles.multiline]}
              placeholder={t("Enter any notes")}
              placeholderTextColor={colors.textMuted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Signature */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t("Driver Signature")}</Text>
            {signatureImage ? (
              <View>
                <View style={{ backgroundColor: '#f0f0f0', borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 4, height: 54, justifyContent: 'center' }}>
                  <Image
                    source={{ uri: signatureImage.startsWith('data:') ? signatureImage : `data:image/png;base64,${signatureImage}` }}
                    style={{ width: '100%', height: 48, backgroundColor: '#fff', ...(signatureNeedsBlackInk(signatureImage) ? {tintColor:'#000'} : {}) }}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{
                    jobSource === 'governed_snapshot'
                      ? (governedPrintedName || signature)
                      : (signature || params.driverName)
                  }</Text>
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
            <Text style={{color:colors.textMuted,marginTop:6}}>
              {params.date} · {reviewOpenedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </Text>
            <Text style={{ color: colors.textDark, marginTop: 6, fontWeight: '600' }}>{t('Legal name')}</Text>
            <TextInput
              ref={nameInputRef}
              onFocus={()=>formKeyboard.focus(nameInputRef.current)}
              style={[styles.input, { marginTop: 8 }]}
              placeholder={t("Print full name")}
              placeholderTextColor={colors.textMuted}
              value={jobSource === 'governed_snapshot' ? governedPrintedName : signature}
              onChangeText={value => { nameEditedRef.current=true; setGovernedPrintedName(value); setSignature(value); }}
              accessibilityLabel={t('Legal name')}
              autoCapitalize="words"
              returnKeyType="done"
            />
          </View>

          <SignatureModal
            visible={showSigModal}
            onClose={() => setShowSigModal(false)}
            onSave={(base64) => {
              setSignatureImage(base64);
              // Auto-fill typed name if empty
              if (!signature.trim() && jobSource !== 'governed_snapshot' && params.driverName) {
                setSignature(params.driverName as string);
              }
            }}
            accent={accent}
          />

      </ScrollView>
      <View style={[footer.bar, footer.row]}>
        <View style={footer.slot}>
        <TouchableOpacity accessibilityRole="button" onPress={() => preparedRead ? preparedRead.back() : router.back()} style={[footer.button, { borderColor: accent }]}><Text style={footer.text}>{t("Back")}</Text></TouchableOpacity>
        </View>
        <View style={footer.slot}>
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: submitting || !preparationConfirmed, busy: submitting }} disabled={submitting || !preparationConfirmed} style={[footer.button, { borderColor: accent, flexDirection: 'row', gap: 6, opacity: preparationConfirmed ? 1 : 0.45 }]} onPress={handleSubmit}>
          {submitting && <ActivityIndicator size="small" color={accent} />}
          <Text style={footer.text}>{submitting ? t("Submitting…") : t("Submit JSA")}</Text>
        </TouchableOpacity>
        </View>
        <View style={footer.slot}>
        <MoreMenu placement="bottom" compact />
        </View>
      </View>
    </KeyboardAvoidingView>

    <Modal visible={!!validationNotice} transparent animationType="fade" onRequestClose={() => setValidationNotice(null)}>
      <View style={brandedModalStyles.backdrop}>
        <View style={brandedModalStyles.card}>
          <View style={[brandedModalStyles.header, { backgroundColor: accent }]}>
            <Text style={brandedModalStyles.headerTitle}>{t('Cannot complete')}</Text>
          </View>
          <View style={brandedModalStyles.body}><Text style={brandedModalStyles.bodyText}>{validationNotice?.message}</Text></View>
          <View style={brandedModalStyles.buttonRow}>
            <TouchableOpacity style={[brandedModalStyles.primaryBtn, { backgroundColor: accent }]} onPress={() => {
              const focusName = validationNotice?.focusName;
              setValidationNotice(null);
              if (focusName) requestAnimationFrame(() => nameInputRef.current?.focus());
            }}><Text style={brandedModalStyles.primaryBtnText}>{t('OK')}</Text></TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

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
              {completeCloudPending
                ? (t("Saved on this device — cloud sync hasn't finished yet. It will remain in Saved JSAs.")
                  || "Saved on this device — cloud sync hasn't finished yet. It will remain in Saved JSAs.")
                : t("Your JSA has been submitted and saved.")}
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
    backgroundColor: "transparent",
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 10,
    paddingBottom: 8,
    gap: 8,
  },
  summaryCard: {
    backgroundColor: colors.glassSurface,
    borderRadius: 12,
    padding: 10,
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
    paddingVertical: 0,
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
    backgroundColor: colors.glassSurface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textDark,
    marginBottom: 4,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 0,
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
    backgroundColor: colors.inputSurface,
  },
  multiline: {
    textAlignVertical: "top",
    minHeight: 48,
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
  submitFooter: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: 'transparent' },
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
