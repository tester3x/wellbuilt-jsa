import AsyncStorage from '@react-native-async-storage/async-storage';
import {isTransientConnection} from './transientConnection';
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
  if (!current || current.uid !== session.uid || current.generation !== session.generation || current.companyId !== session.companyId || current.driverId!==session.driverId) throw new Error('Session changed; retry.');
  return result.data;
}
export async function standaloneAccess(prewarm=false): Promise<boolean> {
  if (!prewarm && await loadLaunchContext()) return false;
  const session=await loadUsableGovernedSession();if(!session)return false;
  const key='@jsa/access-view-v1/'+encodeURIComponent(JSON.stringify([session.uid,session.generation,session.companyId,session.driverId]));
  const refresh=async():Promise<boolean>=>{
  try {
    const result=await standaloneCall({operation:'access'});
    const current=await loadUsableGovernedSession();
    if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId||current.driverId!==session.driverId)return false;
    const allowed=result?.allowed===true&&result.companyId===session.companyId&&result.driverId===session.driverId;
    if(allowed)await AsyncStorage.setItem(key,'verified');else await AsyncStorage.removeItem(key);
    return allowed;
  } catch(error) {
    if(!isTransientConnection(error)){await AsyncStorage.removeItem(key);throw error;}
    const current=await loadUsableGovernedSession();
    if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId||current.driverId!==session.driverId)return false;
    // Presentation cache only; save/submit always calls the authorized server.
    return await AsyncStorage.getItem(key)==='verified';
  }
  };
  // A verified, owner-bound presentation opens immediately. Refresh never grants
  // write access; every server operation still checks current company policy.
  if(!prewarm && await AsyncStorage.getItem(key)==='verified') {
    const current=await loadUsableGovernedSession();
    if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId||current.driverId!==session.driverId)return false;
    void refresh().catch(()=>{});
    return true;
  }
  return refresh();
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
  // History refresh is read-only. Do not re-publish old signed saves merely
  // because a legacy local row lacks its canonical ID or driverId field.
  const owned=(r:any)=>r.companyId===session.companyId&&(r.driverId===session.driverId||!r.driverId&&r.driverHash===session.driverId);
  const canonicalIds=new Map<any,string>();
  for(const item of local.filter(owned))canonicalIds.set(item,item.standaloneRecordId || (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,`${session.companyId}:${session.driverId}:${item.id}`)).slice(0,43));
  const remote: any[] = [];
  let after: string | undefined;
  do {
    const page = await standaloneCall({operation:'list', ...(after ? {after} : {})});
    const records = Array.isArray(page?.records) ? page.records : [];
    remote.push(...records.filter((r:any)=>r.companyId===session.companyId && r.driverId===session.driverId && r.workflow==='standalone'));
    after = records.length === 50 ? records[records.length-1].id : undefined;
  } while (after);
  const current = await loadUsableGovernedSession();
  if (!current || current.uid!==session.uid || current.generation !== session.generation || current.companyId!==session.companyId || current.driverId!==session.driverId) throw new Error('Session changed.');
  const latest = JSON.parse(await AsyncStorage.getItem(STORAGE_KEYS.saves) || '[]');
  for (const r of remote) {
    const matched = local.find((x:any)=>owned(x)&&canonicalIds.get(x)===r.id);
    const snapshot = r.snapshot;
    const converted = { ...(matched || {}), ...snapshot, id:matched?.id || r.id, standaloneRecordId:r.id, workflow:'standalone',
      companyId:r.companyId,driverId:r.driverId,driverHash:r.driverId,shiftId:r.shiftId||null,jsaPeriodId:r.jsaPeriodId||null,jsaNumber:r.jsaNumber||null,state:r.state,closedAtMs:r.closedAtMs??null,
      timestamp:new Date(r.signedAtMs).toISOString(),date:snapshot.formDate || '',driverName:snapshot.printedName,
      signature:snapshot.printedName,signatureImage:`data:image/png;base64,${snapshot.signature.data}`,additions:r.additions || [],
      jobActivityName:r.job.activity,task:r.job.activity,wells:r.job.wells,wellName:r.job.wells[0]?.name || '',
      operator:r.job.operator || matched?.operator || '',assessmentSteps:r.job.assessmentSteps || matched?.assessmentSteps || [],
      ...(r.job.assessmentTemplates ? {assessmentTemplates:r.job.assessmentTemplates,assessmentPpeItems:r.job.assessmentPpeItems,assessmentPreparedItems:r.job.assessmentPreparedItems}: {}),
      ...(r.job.locationLayout ? {locationLayout:r.job.locationLayout}: {}) };
    const i = latest.findIndex((x:any)=>x.id===converted.id && owned(x));
    if(i<0) latest.push(converted); else latest[i]=converted;
  }
  await AsyncStorage.setItem(STORAGE_KEYS.saves,JSON.stringify(latest));
  return latest.filter((r:any)=>r.companyId===session.companyId && (r.driverId===session.driverId || r.driverHash===session.driverId));
}
export async function closeStandaloneJsa(item:any):Promise<void>{
  const {ownJsaRecord}=await import('./jsaRecord');
  item=await ownJsaRecord(item.id);
  const session=await loadUsableGovernedSession();
  if(!session || item.workflow!=='standalone'||item.companyId!==session.companyId || item.driverId!==session.driverId)throw new Error('JSA owner mismatch.');
  const saved = item.standaloneRecordId ? item.standaloneRecordId : (await persistStandaloneJsa(item)).record.id;
  const result=await standaloneCall({operation:'close',recordId:saved});
  if(result?.record?.id!==saved||result.record.state!=='closed'||result.record.companyId!==session.companyId||result.record.driverId!==session.driverId)throw new Error('JSA close could not be verified. Retry.');
  const current=await loadUsableGovernedSession();
  if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId||current.driverId!==session.driverId)throw new Error('Session changed; retry.');
  const storage=(await import('@react-native-async-storage/async-storage')).default;
  const {STORAGE_KEYS}=await import('../constants/storageKeys');
  const rows=JSON.parse(await storage.getItem(STORAGE_KEYS.saves)||'[]');
  const latest=await loadUsableGovernedSession();
  if(!latest||latest.uid!==session.uid||latest.generation!==session.generation||latest.companyId!==session.companyId||latest.driverId!==session.driverId)throw new Error('Session changed; retry.');
  await storage.setItem(STORAGE_KEYS.saves,JSON.stringify(rows.map((r:any)=>r.id===item.id&&r.companyId===session.companyId&&(r.driverId===session.driverId||!r.driverId&&r.driverHash===session.driverId)
    ?{...r,standaloneRecordId:saved,state:'closed',closedAtMs:result.record.closedAtMs}:r)));
}

/** Resolve only an owned local save, then read the canonical record. Route params are not authority. */
export async function getStandaloneRecord(localId:string):Promise<any>{
  if(await loadLaunchContext()) throw new Error('Finish the required JSA request first.');
  // Reading one record must not attempt to publish unrelated pending saves.
  const { ownJsaRecord } = await import('./jsaRecord');
  const item = await ownJsaRecord(localId);
  if(item.workflow!=='standalone')throw new Error('This is a shift JSA. Open it through its shift workflow.');
  const recordId = item.standaloneRecordId || (await persistStandaloneJsa(item)).record.id;
  await resumePendingStandaloneAddition(recordId);
  return (await standaloneCall({operation:'get',recordId})).record;
}

let additionWork:Promise<unknown>=Promise.resolve();
function serializeAddition<T>(fn:()=>Promise<T>):Promise<T>{const result=additionWork.then(fn,fn);additionWork=result.catch(()=>undefined);return result;}
/** Only an already acknowledged, durably saved request can be replayed. */
async function sendPendingAddition(recordId:string,body?:Record<string,unknown>):Promise<void>{
  if(await loadLaunchContext())throw new Error('Finish the required JSA request first.');
  const owner=await loadUsableGovernedSession();if(!owner)throw new Error('Sign in first.');
  if(!/^[A-Za-z0-9_-]{43}$/.test(recordId))throw new Error('Invalid JSA record');
  const storage=(await import('@react-native-async-storage/async-storage')).default;
  const key='jsa.pendingAddition.v1:'+JSON.stringify([owner.companyId,owner.driverId,recordId]);
  const check=async()=>{const current=await loadUsableGovernedSession();if(!current||current.uid!==owner.uid||current.generation!==owner.generation||current.companyId!==owner.companyId||current.driverId!==owner.driverId)throw new Error('Session changed; retry.');};
  await check();let encoded=await storage.getItem(key);await check();
  if(encoded){
    const old=JSON.parse(encoded);
    if(old.operation!=='append'||old.recordId!==recordId||old.addition?.acknowledged!==true||!/^[A-Za-z0-9_-]{43}$/.test(old.additionId))throw new Error('Pending addition is invalid.');
    if(body && encoded!==JSON.stringify(body))throw new Error('An earlier addition is awaiting confirmation. Reopen this JSA to retry it.');
  }else if(body){encoded=JSON.stringify(body);await storage.setItem(key,encoded);await check();}
  if(!encoded)return;
  try{await standaloneCall(JSON.parse(encoded));}
  catch(error){
    // This specific server refusal confirms no append occurred and requires a
    // fresh review. Network/unknown failures keep the original request intact.
    if(error instanceof Error&&error.message.includes('review_latest_record')){
      await check();if(await storage.getItem(key)===encoded)await storage.removeItem(key);
    }
    throw error;
  }
  await check();
  if(await storage.getItem(key)===encoded)await storage.removeItem(key);
}
export async function resumePendingStandaloneAddition(recordId:string):Promise<void>{
  await serializeAddition(()=>sendPendingAddition(recordId));
}
export async function appendStandaloneLocation(record:any,additionId:string,fields:{location:string;operator:string;activity:string;hazards:string;controls:string;ppe:string;conditionsDiffer?:boolean},taskReview?:{templateRefs:unknown[];stepAcks:Record<string,boolean>}):Promise<void>{
  if(await loadLaunchContext())throw new Error('Finish the required JSA request first.');
  const owner=await loadUsableGovernedSession();
  if(!owner||record.companyId!==owner.companyId||record.driverId!==owner.driverId)throw new Error('JSA owner mismatch.');
  const body={operation:'append',recordId:record.id,additionId,addition:{...fields,...(taskReview?{taskReview}:{}),acknowledged:true,baseContentHash:record.contentHash,expectedAdditionCount:(record.additions || []).length}};
  await serializeAddition(async()=>{
    const current=await loadUsableGovernedSession();
    if(!current||current.uid!==owner.uid||current.generation!==owner.generation||current.companyId!==owner.companyId||current.driverId!==owner.driverId)throw new Error('Session changed; retry.');
    await sendPendingAddition(record.id,body);
  });
  await syncStandaloneHistory();
}

export async function standaloneReportHtml(record:any,options?:{t?:(text:string,values?:Record<string,string|number>)=>string;locale?:string}):Promise<string>{
  const {jsaDocumentHtml}=await import('./jsaDocument');
  const s=record.snapshot;
  return jsaDocumentHtml({...s,driverName:s.printedName,truckNumber:s.truckNumber||'',date:s.formDate||'',
    timestamp:new Date(record.signedAtMs).toISOString(),signatureImage:'data:image/png;base64,'+s.signature.data,
    operator:record.job.operator||'',wells:record.job.wells,jobActivityName:record.job.activity,
    assessmentSteps:record.job.assessmentSteps,assessmentTemplates:record.job.assessmentTemplates,
    assessmentPpeItems:record.job.assessmentPpeItems,assessmentPreparedItems:record.job.assessmentPreparedItems,
    locationLayout:record.job.locationLayout,
    additions:record.additions||[]},undefined,options);
}
