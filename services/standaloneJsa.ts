import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { loadUsableGovernedSession } from './sso/jsaGovernedAuthLive';
import { loadLaunchContext } from './sso/jsaRuntime';
import { adaptGovernedSnapshot } from './sso/jsaArtifactSnapshot';

export async function standaloneCall(body: Record<string, unknown>): Promise<any> {
  const session = await loadUsableGovernedSession();
  if (!session) throw new Error('Sign in to WellBuilt JSA first.');
  const call = httpsCallable(getFunctions(getApp()), 'jsaStandalone', { timeout: 15000 });
  const result = await call(body);
  const current = await loadUsableGovernedSession();
  if (!current || current.uid !== session.uid || current.generation !== session.generation || current.companyId !== session.companyId) throw new Error('Session changed; retry.');
  return result.data;
}
export async function standaloneAccess(): Promise<boolean> {
  if (await loadLaunchContext()) return false;
  const result = await standaloneCall({ operation: 'access' });
  const session = await loadUsableGovernedSession();
  return result?.allowed === true && result.companyId === session?.companyId && result.driverId === session?.driverId;
}
export async function persistStandaloneJsa(payload: any): Promise<any> {
  if (await loadLaunchContext()) throw new Error('A required JSA request is active.');
  const session = await loadUsableGovernedSession();
  if (!session || payload.driverId !== session.driverId || payload.companyId !== session.companyId || payload.workflow !== 'standalone') throw new Error('JSA owner mismatch.');
  const snapshot = adaptGovernedSnapshot(payload);
  if (!snapshot.ok) throw new Error('JSA signature or inspection data is incomplete.');
  const recordId = payload.standaloneRecordId || (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${session.companyId}:${session.driverId}:${payload.id}`)).slice(0,43);
  return standaloneCall({ operation: 'create', recordId, snapshot: snapshot.value, job: {
    ...(payload.templateRefs?.length ? {templateRefs:payload.templateRefs} : {}),
    ...(payload.assessmentSteps?.length ? {assessmentSteps:payload.assessmentSteps} : {}),
    // Older saves must retain their original canonical create hash on retry.
    ...(payload.assessmentSteps?.length && payload.operator ? {operator:String(payload.operator).trim()} : {}),
    activity: String(payload.jobActivityName || '').trim(),
    wells: (payload.wells || []).map((w:any) => ({ name: String(w.name || '').trim(), jobType: String(w.jobType || '').trim(), operator: String(w.operator || '').trim(), county: String(w.county || '').trim() })),
  } });
}
export async function syncStandaloneHistory(): Promise<any[]> {
  const session = await loadUsableGovernedSession();
  if (!session) throw new Error('Sign in first.');
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  const { STORAGE_KEYS } = await import('../constants/storageKeys');
  const local = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.saves) || '[]');
  for (const item of local) {
    if (item.workflow === 'standalone' && !item.standaloneRecordId && item.driverId === session.driverId && item.companyId === session.companyId) {
      // Preserve incomplete local saves for review; never let one prevent
      // downloading or refreshing other signed records. Explicit create still rejects it.
      if (!adaptGovernedSnapshot(item).ok) continue;
      const saved = await persistStandaloneJsa(item);
      item.standaloneRecordId = saved.record.id;
    }
  }
  const remote: any[] = [];
  let after: string | undefined;
  do {
    const page = await standaloneCall({operation:'list', ...(after ? {after} : {})});
    const records = Array.isArray(page?.records) ? page.records : [];
    remote.push(...records.filter((r:any)=>r.companyId===session.companyId && r.driverId===session.driverId && r.workflow==='standalone'));
    after = records.length === 50 ? records[records.length-1].id : undefined;
  } while (after);
  const current = await loadUsableGovernedSession();
  if (!current || current.generation !== session.generation) throw new Error('Session changed.');
  const latest = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.saves) || '[]');
  for (const r of remote) {
    const matched = local.find((x:any)=>x.standaloneRecordId===r.id && x.companyId===session.companyId && x.driverId===session.driverId);
    const snapshot = r.snapshot;
    const converted = { ...(matched || {}), ...snapshot, id:matched?.id || r.id, standaloneRecordId:r.id, workflow:'standalone',
      companyId:r.companyId,driverId:r.driverId,driverHash:r.driverId,shiftId:null,state:r.state,
      timestamp:new Date(r.signedAtMs).toISOString(),date:snapshot.formDate || '',driverName:snapshot.printedName,
      signature:snapshot.printedName,signatureImage:`data:image/png;base64,${snapshot.signature.data}`,additions:r.additions || [],
      jobActivityName:r.job.activity,task:r.job.activity,wells:r.job.wells,wellName:r.job.wells[0]?.name || '',
      operator:r.job.operator || matched?.operator || '',assessmentSteps:r.job.assessmentSteps || matched?.assessmentSteps || [],
      ...(r.job.assessmentTemplates ? {assessmentTemplates:r.job.assessmentTemplates,assessmentPpeItems:r.job.assessmentPpeItems,assessmentPreparedItems:r.job.assessmentPreparedItems}: {}) };
    const i = latest.findIndex((x:any)=>x.id===converted.id && x.companyId===r.companyId && x.driverId===r.driverId);
    if(i<0) latest.push(converted); else latest[i]=converted;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.saves,JSON.stringify(latest));
  return latest.filter((r:any)=>r.companyId===session.companyId && (r.driverId===session.driverId || r.driverHash===session.driverId));
}
export async function closeStandaloneJsa(item:any):Promise<void>{
  const session=await loadUsableGovernedSession();
  if(!session || item.companyId!==session.companyId || item.driverId!==session.driverId)throw new Error('JSA owner mismatch.');
  const saved = item.standaloneRecordId ? item.standaloneRecordId : (await persistStandaloneJsa(item)).record.id;
  await standaloneCall({operation:'close',recordId:saved});
  await syncStandaloneHistory();
}

/** Resolve only an owned local save, then read the canonical record. Route params are not authority. */
export async function getStandaloneRecord(localId:string):Promise<any>{
  if(await loadLaunchContext()) throw new Error('Finish the required JSA request first.');
  // Reading one record must not attempt to publish unrelated pending saves.
  const { ownJsaRecord } = await import('./jsaRecord');
  const item = await ownJsaRecord(localId);
  if(item.workflow!=='standalone')throw new Error('This is a shift JSA. Open it through its shift workflow.');
  const recordId = item.standaloneRecordId || (await persistStandaloneJsa(item)).record.id;
  return (await standaloneCall({operation:'get',recordId})).record;
}

export async function appendStandaloneLocation(record:any,additionId:string,fields:{location:string;operator:string;activity:string;hazards:string;controls:string;ppe:string},taskReview?:{templateRefs:unknown[];stepAcks:Record<string,boolean>}):Promise<void>{
  if(await loadLaunchContext())throw new Error('Finish the required JSA request first.');
  await standaloneCall({operation:'append',recordId:record.id,additionId,addition:{...fields,...(taskReview?{taskReview}:{}),acknowledged:true,baseContentHash:record.contentHash,expectedAdditionCount:(record.additions || []).length}});
  await syncStandaloneHistory();
}

export async function standaloneReportHtml(record:any):Promise<string>{
  const {buildJsaPdfHtml}=await import('./jsaPdfHtml');
  const s=record.snapshot;
  return buildJsaPdfHtml({driverName:s.printedName,truckNumber:s.truckNumber || '',pusher:s.pusher,
    wellName:'',wells:record.job.wells,jobActivity:record.job.activity,date:s.formDate || '',notes:s.notes,
    signature:s.printedName,signatureImage:`data:image/png;base64,${s.signature.data}`,locations:s.locations,
    locationAcks:{},ppeItems:[...Object.keys(s.ppeSelected).filter(k=>s.ppeSelected[k]),...(s.ppeOtherItems || [])],
    preparedItems:Object.keys(s.prepared).filter(k=>s.prepared[k]),emergencyContacts:[],companyContacts:[],accent:'#DAA520',additions:record.additions || []});
}
