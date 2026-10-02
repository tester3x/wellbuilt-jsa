import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS} from '../constants/storageKeys';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';

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

/** A saved signature alone is not evidence that a Suite shift is still open. */
export async function ownOpenJsaRecords(){
 const session=await loadUsableGovernedSession();if(!session)throw new Error('Sign in first.');
 const rows=await ownJsaRecords();
 const {authenticatedGovernedFirestoreFetch}=await import('./sso/jsaGovernedHistoryLookupLive');
 const openShifts=new Set<string>();
 const shifts=[...new Set<string>(rows.filter((r:any)=>r.workflow!=='standalone'&&typeof r.shiftId==='string').map((r:any)=>r.shiftId))];
 const todayStr = new Date().toISOString().slice(0, 10);
 let unverified=false;

 for(const shiftId of shifts){
   const date=/^\d{4}-\d{2}-\d{2}/.exec(shiftId)?.[0] || todayStr;
   try{
     const response=await authenticatedGovernedFirestoreFetch(`https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/driver_shifts/${encodeURIComponent(session.driverId+'_'+date)}`);
     if(!response.ok){unverified=true;continue;}
     const doc=await response.json();
     if(doc?.fields?.currentShiftId?.stringValue===shiftId) openShifts.add(shiftId);
   }catch{unverified=true;}
 }

 const current=await loadUsableGovernedSession();
 if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId)throw new Error('Session changed. Reopen your JSAs.');

 const filteredRows: any[] = [];
 for (const r of rows) {
   if (r.state === 'closed' || r.state === 'discarded') continue;

   if (r.workflow === 'standalone') {
     if (r.state === 'open') {
       filteredRows.push({ ...r, isPriorDayOrphan: false, canCloseOrphan: false });
     }
     continue;
   }

   // Shift JSA: check if active shift or prior-day orphan
   const shiftDate = /^\d{4}-\d{2}-\d{2}/.exec(r.shiftId || '')?.[0] || r.date || '';
   const isServerShiftOpen = openShifts.has(r.shiftId);
   const isToday = shiftDate === todayStr;

   if (isServerShiftOpen || isToday) {
     // Active/today's shift: managed through Suite / normal shift lifecycle, not closeable from orphan list
     filteredRows.push({
       ...r,
       isPriorDayOrphan: false,
       canCloseOrphan: false,
     });
   } else {
     // Prior-day record: check signature evidence
     const isSigned = hasPositiveSignatureEvidence(r);
     filteredRows.push({
       ...r,
       isPriorDayOrphan: true,
       isSigned,
       canCloseOrphan: isSigned,
       canFinish: !isSigned,
       canDiscard: !isSigned,
     });
   }
 }

 return {rows: filteredRows, unverified};
}

/** Close a prior-day signed shift JSA orphan */
export async function closeShiftJsaOrphan(item: any): Promise<void> {
  const session = await loadUsableGovernedSession();
  if (!session || item.companyId !== session.companyId || (item.driverId !== session.driverId && item.driverHash !== session.driverId)) {
    throw new Error('JSA owner mismatch.');
  }

  // Gate against active shift and today's date
  const todayStr = new Date().toISOString().slice(0, 10);
  const shiftDate = /^\d{4}-\d{2}-\d{2}/.exec(item.shiftId || '')?.[0] || item.date || '';
  if (shiftDate === todayStr && item.shiftId) {
    try {
      const { authenticatedGovernedFirestoreFetch } = await import('./sso/jsaGovernedHistoryLookupLive');
      const response = await authenticatedGovernedFirestoreFetch(
        `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/driver_shifts/${encodeURIComponent(session.driverId + '_' + todayStr)}`
      );
      if (response.ok) {
        const doc = await response.json();
        if (doc?.fields?.currentShiftId?.stringValue === item.shiftId) {
          throw new Error('Active shift JSAs cannot be closed from the orphan list.');
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('Active shift JSAs')) throw err;
    }
  }

  if (!hasPositiveSignatureEvidence(item)) {
    throw new Error('Unsigned JSAs cannot be closed. Finish or discard them.');
  }

  const AsyncStorageLib = (await import('@react-native-async-storage/async-storage')).default;
  const rawSaves = await AsyncStorageLib.getItem(STORAGE_KEYS.saves);
  const saves = JSON.parse(rawSaves || '[]');
  const nowIso = new Date().toISOString();
  let updated = false;

  for (const r of saves) {
    if (r.id === item.id && r.companyId === session.companyId) {
      r.state = 'closed';
      r.closedAt = nowIso;
      updated = true;
    }
  }
  if (updated) {
    await AsyncStorageLib.setItem(STORAGE_KEYS.saves, JSON.stringify(saves));
  }

  // Best effort Firestore sync
  try {
    const { authenticatedGovernedFirestoreFetch } = await import('./sso/jsaGovernedHistoryLookupLive');
    const driverHash = session.driverId;
    const shiftId = item.shiftId || shiftDate;
    const docId = `${driverHash}_${shiftId}`;
    const patchUrl = `https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/jsa_day_status/${encodeURIComponent(docId)}?updateMask.fieldPaths=state&updateMask.fieldPaths=closedAt&updateMask.fieldPaths=updatedAt`;
    await authenticatedGovernedFirestoreFetch(patchUrl, {
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
  } catch {}

  const { wbDiagLog } = await import('./wbDiagLog');
  wbDiagLog({
    area: 'jsa',
    event: 'orphan.close',
    source: 'jsaRecord.closeShiftJsaOrphan',
    result: 'ok',
    driverHash: session.driverId,
    shiftId: item.shiftId,
    extra: { id: item.id, date: item.date },
  });
}

/** Discard an unsigned/incomplete prior-day shift JSA orphan with audit logging */
export async function discardUnsignedJsaOrphan(item: any, reason: string = 'discarded_by_driver'): Promise<void> {
  const session = await loadUsableGovernedSession();
  if (!session || item.companyId !== session.companyId || (item.driverId !== session.driverId && item.driverHash !== session.driverId)) {
    throw new Error('JSA owner mismatch.');
  }

  const AsyncStorageLib = (await import('@react-native-async-storage/async-storage')).default;
  const rawSaves = await AsyncStorageLib.getItem(STORAGE_KEYS.saves);
  const saves = JSON.parse(rawSaves || '[]');
  const nowIso = new Date().toISOString();
  let updated = false;

  for (const r of saves) {
    if (r.id === item.id && r.companyId === session.companyId) {
      r.state = 'discarded';
      r.discardedAt = nowIso;
      r.discardReason = reason;
      updated = true;
    }
  }
  if (updated) {
    await AsyncStorageLib.setItem(STORAGE_KEYS.saves, JSON.stringify(saves));
  }

  const { wbDiagLog } = await import('./wbDiagLog');
  wbDiagLog({
    area: 'jsa',
    event: 'orphan.discard',
    source: 'jsaRecord.discardUnsignedJsaOrphan',
    result: 'ok',
    driverHash: session.driverId,
    shiftId: item.shiftId,
    extra: { id: item.id, date: item.date, reason },
  });
}
