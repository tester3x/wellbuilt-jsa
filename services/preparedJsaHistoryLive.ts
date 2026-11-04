import AsyncStorage from '@react-native-async-storage/async-storage';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {app} from './firebase';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';
import {ownJsaRecords,PREPARED_HISTORY_CACHE} from './jsaRecord';

/** Restore signed cloud reports as well as this phone's pending offline reads.
 * The existing read-only export accepts at most 31 days per request. Cover the
 * known history through today, including the entire current month on an empty
 * install. No current-shift authority or legacy cloud writes are involved. */
export async function syncPreparedJsaHistory():Promise<void>{
 const session=await loadUsableGovernedSession();if(!session)throw Error('Sign in first.');
 const local=await ownJsaRecords(),today=new Date();
 const dates=local.map((r:any)=>r.date).filter((d:any)=>typeof d==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(d));
 const parts=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const end=parts(today),start=[end.slice(0,7)+'-01',...dates.filter((d:string)=>d<=end)].sort()[0];
 const call=httpsCallable(getFunctions(app),'jsaWeeklyForms',{timeout:45000});
 const records:any[]=[];
 let cursor=start;
 while(cursor<=end){
  const d=new Date(cursor+'T12:00:00');d.setDate(d.getDate()+30);const until=parts(d)<end?parts(d):end;
  const result=await call({startDate:cursor,endDate:until,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});
  const p=result.data as any;
  if(p?.schemaVersion!==1||p.companyId!==session.companyId||p.driverId!==session.driverId||p.startDate!==cursor||p.endDate!==until||!Array.isArray(p.records))throw Error('JSA history owner or range changed.');
  if(p.missing?.length)throw Error('Some original signed JSA reports could not be loaded.');
  for(const r of p.records){
   // Scope acknowledgements are linked to a full report, not extra signatures.
   if(r.source!=='governed'||r.kind!=='jsa_read'||!r.record?.signatureImage||!Number.isFinite(Date.parse(r.completedAt)))continue;
   records.push({...r.record,id:r.id,workflow:'prepared',state:'saved',companyId:session.companyId,driverId:session.driverId,
    jobRef:r.jobRef,shiftId:r.shiftId,timestamp:r.completedAt,date:r.date,driverName:r.record.printedName,
    signature:r.record.printedName,assessmentArchiveUnavailable:!r.record.assessmentSteps?.length});
  }
  const next=new Date(until+'T12:00:00');next.setDate(next.getDate()+1);cursor=parts(next);
 }
 const current=await loadUsableGovernedSession();
 if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId||current.driverId!==session.driverId)throw Error('Session changed.');
 const key=PREPARED_HISTORY_CACHE+encodeURIComponent(JSON.stringify([session.uid,session.companyId,session.driverId]));
 const previous=JSON.parse(await AsyncStorage.getItem(key)||'[]');
 const merged=new Map<string,any>();for(const r of [...previous,...records])merged.set(r.id,r);
 await AsyncStorage.setItem(key,JSON.stringify([...merged.values()]));
}
