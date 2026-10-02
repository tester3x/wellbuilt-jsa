import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../constants/storageKeys';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';

export function shiftDateOf(shiftId: string | null | undefined): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(shiftId || ''));
  return m ? m[1] : null;
}

export async function ownJsaRecords(){
 const session=await loadUsableGovernedSession();if(!session)throw new Error('Sign in to WellBuilt JSA first.');
 const rows=JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.saves)||'[]');
 const current=await loadUsableGovernedSession();
 if(!current||current.uid!==session.uid||current.generation!==session.generation)throw new Error('Session changed. Reopen your JSA.');
 return rows.filter((r:any)=>r.companyId===session.companyId&&(r.driverId===session.driverId||r.driverHash===session.driverId));
}

export async function ownJsaRecord(id:string){
 const r=(await ownJsaRecords()).find((r:any)=>r.id===id);
 if(!r)throw new Error('This JSA is not available for the signed-in driver.');
 return r;
}

/** Check if a JSA record carries positive signature evidence */
export function hasPositiveSignatureEvidence(record: any): boolean {
  if (!record) return false;
  return !!(
    record.signature ||
    record.signatureImage ||
    record.signedAt ||
    (typeof record.pdfUrl === 'string' && record.pdfUrl.trim().length > 0) ||
    record.state === 'signed' ||
    record.signatureCaptured
  );
}

export interface ShiftAuthorityVerdict {
  status: 'verified_orphan' | 'active_shift' | 'today_shift' | 'malformed' | 'unverified';
  shiftDate: string | null;
  serverCurrentShiftId?: string | null;
  httpStatus?: number;
  error?: string;
}

/**
 * Shared fail-closed authority check for prior-day shift JSA orphans.
 * Checks server's driver_shifts/{driverId}_{shiftDate}.currentShiftId.
 * Fails closed on active shifts, non-OK reads (403/404/500/timeout), malformed dates, today's work, and session mismatches.
 */
export async function checkShiftOrphanAuthority(
  record: any,
  session: any
): Promise<ShiftAuthorityVerdict> {
  if (!session || !session.driverId) {
    return { status: 'unverified', shiftDate: null, error: 'No active governed session.' };
  }

  // 1. Validate shift date identity
  const shiftId = typeof record?.shiftId === 'string' ? record.shiftId : '';
  const shiftDate = shiftDateOf(shiftId) || (/^\d{4}-\d{2}-\d{2}$/.test(record?.date || '') ? record.date : null);
  if (!shiftDate || !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate)) {
    return { status: 'malformed', shiftDate: null, error: 'Malformed shift identity: cannot determine shift date.' };
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // 2. Reject today's work or future dates
  if (shiftDate === todayStr) {
    return { status: 'today_shift', shiftDate, error: "Today's shift belongs to active shift lifecycle." };
  }
  if (shiftDate > todayStr) {
    return { status: 'malformed', shiftDate, error: 'Invalid future shift date.' };
  }

  // 3. Query server driver_shifts document for origin day
  try {
    const { authenticatedGovernedFirestoreFetch } = await import('./sso/jsaGovernedHistoryLookupLive');
    const url = `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/driver_shifts/${encodeURIComponent(session.driverId + '_' + shiftDate)}`;
    const response = await authenticatedGovernedFirestoreFetch(url);

    if (!response.ok) {
      return {
        status: 'unverified',
        shiftDate,
        httpStatus: response.status,
        error: `Server shift authority could not be verified (HTTP ${response.status}).`,
      };
    }

    const doc = await response.json();
    const serverCurrentShiftId = doc?.fields?.currentShiftId?.stringValue ?? null;

    // If server names this exact shiftId as current, it is an active shift (e.g. overnight)
    if (shiftId && serverCurrentShiftId === shiftId) {
      return {
        status: 'active_shift',
        shiftDate,
        serverCurrentShiftId,
        error: 'Active shift in progress on server.',
      };
    }

    // Shift is confirmed not active on server
    return {
      status: 'verified_orphan',
      shiftDate,
      serverCurrentShiftId,
    };
  } catch (err: any) {
    return {
      status: 'unverified',
      shiftDate,
      error: `Server shift authority could not be verified: ${err?.message || 'network error'}.`,
    };
  }
}

/** A saved signature alone is not evidence that a Suite shift is still open. */
export async function ownOpenJsaRecords(){
  const session=await loadUsableGovernedSession();if(!session)throw new Error('Sign in first.');
  const rows=await ownJsaRecords();
  let unverified=false;
  const authorityCache = new Map<string, ShiftAuthorityVerdict>();

  const filteredRows: any[] = [];
  for (const r of rows) {
    if (r.state === 'closed' || r.state === 'discarded') continue;

    if (r.workflow === 'standalone') {
      if (r.state === 'open') {
        filteredRows.push({ ...r, isPriorDayOrphan: false, canCloseOrphan: false, canFinish: true, canDiscard: false });
      }
      continue;
    }

    // Shift JSA
    const cacheKey = `${r.shiftId || ''}#${r.date || ''}`;
    let verdict = authorityCache.get(cacheKey);
    if (!verdict) {
      verdict = await checkShiftOrphanAuthority(r, session);
      authorityCache.set(cacheKey, verdict);
    }

    if (verdict.status === 'unverified') {
      unverified = true;
      // Fail closed: record may be visible, but Close and Discard are strictly disabled
      const isSigned = hasPositiveSignatureEvidence(r);
      filteredRows.push({
        ...r,
        isPriorDayOrphan: true,
        isSigned,
        canCloseOrphan: false, // FAIL CLOSED
        canDiscard: false,     // FAIL CLOSED
        canFinish: !isSigned,
      });
    } else if (verdict.status === 'verified_orphan') {
      const isSigned = hasPositiveSignatureEvidence(r);
      filteredRows.push({
        ...r,
        isPriorDayOrphan: true,
        isSigned,
        canCloseOrphan: isSigned,
        canDiscard: !isSigned,
        canFinish: !isSigned,
      });
    } else if (verdict.status === 'active_shift' || verdict.status === 'today_shift') {
      // Active / today's shift: cannot close or discard from orphan screen
      filteredRows.push({
        ...r,
        isPriorDayOrphan: false,
        canCloseOrphan: false,
        canDiscard: false,
        canFinish: true,
      });
    } else {
      // Malformed: reject from orphan actions
      filteredRows.push({
        ...r,
        isPriorDayOrphan: false,
        canCloseOrphan: false,
        canDiscard: false,
        canFinish: false,
      });
    }
  }

  const current = await loadUsableGovernedSession();
  if (!current || current.uid !== session.uid || current.generation !== session.generation || current.companyId !== session.companyId || current.driverId !== session.driverId) {
    throw new Error('Session changed. Reopen your JSAs.');
  }

  return { rows: filteredRows, unverified };
}

/** Close a prior-day signed shift JSA orphan */
export async function closeShiftJsaOrphan(idOrItem: any): Promise<void> {
  const session = await loadUsableGovernedSession();
  if (!session) throw new Error('Sign in first.');

  const id = typeof idOrItem === 'string' ? idOrItem : idOrItem?.id;
  if (!id) throw new Error('Missing JSA id.');

  const AsyncStorageLib = (await import('@react-native-async-storage/async-storage')).default;
  const rawSaves = await AsyncStorageLib.getItem(STORAGE_KEYS.saves);
  const saves = JSON.parse(rawSaves || '[]');

  // Reload saved record by ID from storage
  const record = saves.find((r: any) => r.id === id);
  if (!record) throw new Error('JSA record not found.');

  // Verify owner
  if (record.companyId !== session.companyId || (record.driverId !== session.driverId && record.driverHash !== session.driverId)) {
    throw new Error('JSA owner mismatch.');
  }

  // Verify workflow & state
  if (record.workflow === 'standalone') {
    throw new Error('Standalone JSAs cannot be closed as shift orphans.');
  }
  if (record.state === 'closed') {
    throw new Error('JSA is already closed.');
  }
  if (record.state === 'discarded') {
    throw new Error('JSA is already discarded.');
  }

  // Verify signature evidence on reloaded saved record
  if (!hasPositiveSignatureEvidence(record)) {
    throw new Error('Unsigned JSAs cannot be closed. Finish or discard them.');
  }

  // Fail-closed authority check
  const verdict = await checkShiftOrphanAuthority(record, session);
  if (verdict.status === 'today_shift') {
    throw new Error("Active shift JSAs cannot be closed from the orphan list.");
  }
  if (verdict.status === 'active_shift') {
    throw new Error("Active shift JSAs cannot be closed from the orphan list.");
  }
  if (verdict.status === 'malformed') {
    throw new Error(verdict.error || "Malformed shift identity: cannot determine shift date.");
  }
  if (verdict.status === 'unverified') {
    throw new Error(verdict.error || "Server shift authority could not be verified. Cannot close unverified shift.");
  }
  if (verdict.status !== 'verified_orphan') {
    throw new Error("Shift is not an eligible prior-day orphan.");
  }

  // Verify session has not changed
  const currentSession = await loadUsableGovernedSession();
  if (!currentSession || currentSession.uid !== session.uid || currentSession.generation !== session.generation || currentSession.companyId !== session.companyId || currentSession.driverId !== session.driverId) {
    throw new Error('Session changed during verification.');
  }

  const nowIso = new Date().toISOString();
  const driverHash = session.driverId;
  const shiftId = record.shiftId || verdict.shiftDate;
  const docId = `${driverHash}_${shiftId}`;

  // Execute Firestore PATCH to jsa_day_status
  const { authenticatedGovernedFirestoreFetch } = await import('./sso/jsaGovernedHistoryLookupLive');
  const patchUrl = `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/jsa_day_status/${encodeURIComponent(docId)}?updateMask.fieldPaths=state&updateMask.fieldPaths=closedAt&updateMask.fieldPaths=updatedAt`;

  let response: any;
  try {
    response = await authenticatedGovernedFirestoreFetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          state: { stringValue: 'closed' },
          closedAt: { timestampValue: nowIso },
          updatedAt: { timestampValue: nowIso },
        },
      }),
    });
  } catch (err: any) {
    const { wbDiagLog } = await import('./wbDiagLog');
    wbDiagLog({
      area: 'jsa',
      event: 'orphan.close',
      source: 'jsaRecord.closeShiftJsaOrphan',
      result: 'error',
      driverHash: session.driverId,
      shiftId: record.shiftId,
      extra: { id: record.id, date: record.date, error: err?.message },
    });
    throw new Error(`Failed to close JSA on server: ${err?.message || 'network error'}. Local record preserved for retry.`);
  }

  if (!response || !response.ok) {
    const status = response ? response.status : 'unknown';
    const { wbDiagLog } = await import('./wbDiagLog');
    wbDiagLog({
      area: 'jsa',
      event: 'orphan.close',
      source: 'jsaRecord.closeShiftJsaOrphan',
      result: 'error',
      driverHash: session.driverId,
      shiftId: record.shiftId,
      extra: { id: record.id, date: record.date, httpStatus: status },
    });
    throw new Error(`Failed to close JSA on server (HTTP ${status}). Local record preserved for retry.`);
  }

  // Only update local storage AFTER successful Firestore PATCH
  const latestRaw = await AsyncStorageLib.getItem(STORAGE_KEYS.saves);
  const latestSaves = JSON.parse(latestRaw || '[]');
  let updated = false;
  for (const r of latestSaves) {
    if (r.id === id && r.companyId === session.companyId) {
      r.state = 'closed';
      r.closedAt = nowIso;
      updated = true;
    }
  }
  if (updated) {
    await AsyncStorageLib.setItem(STORAGE_KEYS.saves, JSON.stringify(latestSaves));
  }

  const { wbDiagLog } = await import('./wbDiagLog');
  wbDiagLog({
    area: 'jsa',
    event: 'orphan.close',
    source: 'jsaRecord.closeShiftJsaOrphan',
    result: 'ok',
    driverHash: session.driverId,
    shiftId: record.shiftId,
    extra: { id: record.id, date: record.date },
  });
}

/** Discard an unsigned/incomplete prior-day shift JSA orphan with audit logging */
export async function discardUnsignedJsaOrphan(idOrItem: any, reason: string = 'discarded_by_driver'): Promise<void> {
  const session = await loadUsableGovernedSession();
  if (!session) throw new Error('Sign in first.');

  const id = typeof idOrItem === 'string' ? idOrItem : idOrItem?.id;
  if (!id) throw new Error('Missing JSA id.');

  const AsyncStorageLib = (await import('@react-native-async-storage/async-storage')).default;
  const rawSaves = await AsyncStorageLib.getItem(STORAGE_KEYS.saves);
  const saves = JSON.parse(rawSaves || '[]');

  // Reload saved record by ID from storage
  const record = saves.find((r: any) => r.id === id);
  if (!record) throw new Error('JSA record not found.');

  // Verify owner
  if (record.companyId !== session.companyId || (record.driverId !== session.driverId && record.driverHash !== session.driverId)) {
    throw new Error('JSA owner mismatch.');
  }

  // Verify workflow & state
  if (record.workflow === 'standalone') {
    throw new Error('Standalone JSAs cannot be discarded as shift orphans.');
  }
  if (record.state === 'closed') {
    throw new Error('Closed JSAs cannot be discarded.');
  }
  if (record.state === 'discarded') {
    throw new Error('JSA is already discarded.');
  }

  // Verify that the saved record is TRULY unsigned
  if (hasPositiveSignatureEvidence(record)) {
    throw new Error('Signed JSAs cannot be discarded.');
  }

  // Fail-closed authority check
  const verdict = await checkShiftOrphanAuthority(record, session);
  if (verdict.status === 'today_shift') {
    throw new Error("Active shift JSAs cannot be discarded from the orphan list.");
  }
  if (verdict.status === 'active_shift') {
    throw new Error("Active shift JSAs cannot be discarded from the orphan list.");
  }
  if (verdict.status === 'malformed') {
    throw new Error(verdict.error || "Malformed shift identity: cannot determine shift date.");
  }
  if (verdict.status === 'unverified') {
    throw new Error(verdict.error || "Server shift authority could not be verified. Cannot discard unverified shift.");
  }
  if (verdict.status !== 'verified_orphan') {
    throw new Error("Shift is not an eligible prior-day orphan.");
  }

  // Verify session has not changed
  const currentSession = await loadUsableGovernedSession();
  if (!currentSession || currentSession.uid !== session.uid || currentSession.generation !== session.generation || currentSession.companyId !== session.companyId || currentSession.driverId !== session.driverId) {
    throw new Error('Session changed during verification.');
  }

  const nowIso = new Date().toISOString();

  // Re-read latest saves to avoid clobbering concurrent changes
  const latestRaw = await AsyncStorageLib.getItem(STORAGE_KEYS.saves);
  const latestSaves = JSON.parse(latestRaw || '[]');
  let updated = false;

  for (const r of latestSaves) {
    if (r.id === id && r.companyId === session.companyId) {
      r.state = 'discarded';
      r.discardedAt = nowIso;
      r.discardReason = reason;
      updated = true;
    }
  }
  if (updated) {
    await AsyncStorageLib.setItem(STORAGE_KEYS.saves, JSON.stringify(latestSaves));
  }

  const { wbDiagLog } = await import('./wbDiagLog');
  wbDiagLog({
    area: 'jsa',
    event: 'orphan.discard',
    source: 'jsaRecord.discardUnsignedJsaOrphan',
    result: 'ok',
    driverHash: session.driverId,
    shiftId: record.shiftId,
    extra: { id: record.id, date: record.date, reason },
  });
}
