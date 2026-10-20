import AsyncStorage from '@react-native-async-storage/async-storage';
import {platformDelivery} from './platformDelivery';
import {classifyPlatformFailure} from './platformRuntime.generated';
import {enrichResumedJsa} from './jsaResumeProjection';
import {getApp} from 'firebase/app';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';
export type JsaHomeState={protocolVersion:1;companyId:string;driverId:string;shiftState:'open'|'none';shiftId:string|null;action:'new'|'resume';active:null|{kind:'governed'|'standalone';id:string;jsaNumber:string|null};record?:any;offline?:boolean;cachedAtMs?:number};
type Owner={uid:string;generation:string;companyId:string;driverId:string};
const cacheKey=(o:Owner)=>'@jsa/home-view-v1:'+JSON.stringify([o.uid,o.companyId,o.driverId]);
const sameOwner=(a:Owner,b:Owner|null)=>!!b&&a.uid===b.uid&&a.generation===b.generation&&a.companyId===b.companyId&&a.driverId===b.driverId;
const sameJsa=(a:JsaHomeState,b:JsaHomeState)=>a.shiftId===b.shiftId&&a.active?.id===b.active?.id&&a.active?.kind===b.active?.kind;
let cacheTail:Promise<unknown>=Promise.resolve();
const prefetching=new Set<string>();
const cacheEpoch=new Map<string,number>();
let requestSequence=0;const lastCacheWrite=new Map<string,number>();
function validHome(r:JsaHomeState,owner:Owner){
 return !!r&&r.protocolVersion===1&&r.companyId===owner.companyId&&r.driverId===owner.driverId&&['open','none'].includes(r.shiftState)&&['new','resume'].includes(r.action)
  &&(r.shiftState!=='open'||typeof r.shiftId==='string'&&/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(r.shiftId))
  &&(r.shiftState!=='none'||r.shiftId===null&&r.action==='new'&&r.active===null)
  &&(r.action!=='resume'||!!r.active&&['governed','standalone'].includes(r.active.kind)&&typeof r.active.id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(r.active.id))
  &&(r.action!=='new'||r.active===null);
}
async function cachedFor(owner:Owner,operation:'status'|'read'):Promise<JsaHomeState|null>{
 try{
  const saved=JSON.parse(await AsyncStorage.getItem(cacheKey(owner))||'null');
  if(saved?.version!==1||saved.owner!==cacheKey(owner))return null;
  const row=operation==='read'?saved.read:saved.status;
  if(!row||!Number.isFinite(row.at)||!validHome(row.state,owner))return null;
  if(operation==='read'&&(!saved.status||!validHome(saved.status.state,owner)||!sameJsa(row.state,saved.status.state)))return null;
  if(operation==='read'&&row.state.action==='resume'&&(!row.state.record||row.state.record.id!==row.state.active?.id||typeof row.state.record.signatureImage!=='string'))return null;
  if(!sameOwner(owner,await loadUsableGovernedSession()))return null;
  return {...row.state,offline:true,cachedAtMs:row.at};
 }catch{return null;}
}
/** Presentation only: this snapshot never supplies shift or submission authority. */
export async function readCachedJsaHome(operation:'status'|'read'='status'){
 const owner=await loadUsableGovernedSession();return owner?cachedFor(owner,operation):null;
}
async function rememberHome(owner:Owner,state:JsaHomeState,operation:'status'|'read',startedAt:number,epoch:number,order:number){
 const write=async()=>{
  if(!sameOwner(owner,await loadUsableGovernedSession())||epoch!==(cacheEpoch.get(cacheKey(owner))||0))return;
  const key=cacheKey(owner);let previous:any=null;try{previous=JSON.parse(await AsyncStorage.getItem(key)||'null');}catch{}
  if((lastCacheWrite.get(key)||0)>order)return;
  const clean={...state};delete clean.offline;delete clean.cachedAtMs;
  const row={at:Date.now(),startedAt,state:clean};
  const read=operation==='read'?row:previous?.read&&validHome(previous.read.state,owner)&&sameJsa(previous.read.state,state)?previous.read:null;
  await AsyncStorage.setItem(key,JSON.stringify({version:1,owner:key,status:{...row,state:{...clean,record:undefined}},read}));lastCacheWrite.set(key,order);
 };
 const job=cacheTail.then(write,write);cacheTail=job.catch(()=>{});await job.catch(()=>{});
}
export async function loadJsaHome(operation:'status'|'read'='status'):Promise<JsaHomeState>{
 const before=await loadUsableGovernedSession();if(!before)throw Error('Sign in to WellBuilt JSA first.');
 const cached=await cachedFor(before,operation),startedAt=Date.now(),epoch=cacheEpoch.get(cacheKey(before))||0,order=++requestSequence;
 let result;
 try{result=await platformDelivery.attempt(()=>httpsCallable(getFunctions(getApp()),'jsaHomeState',{timeout:35000})({protocolVersion:1,operation}));}
 catch(error){
  if(!sameOwner(before,await loadUsableGovernedSession()))throw Error('Session changed. Reopen JSA.');
  if(classifyPlatformFailure(error)==='transport'&&cached)return cached;
  if(classifyPlatformFailure(error)==='access'){cacheEpoch.set(cacheKey(before),epoch+1);await cacheTail;await AsyncStorage.removeItem(cacheKey(before)).catch(()=>{});}
  throw error;
 }
 const after=await loadUsableGovernedSession();
 if(!after||!sameOwner(before,after))throw Error('Session changed. Reopen JSA.');
 const r=result.data as JsaHomeState;
 if(!validHome(r,after!))throw Error('Could not verify JSA status.');
 if(operation==='read'&&r.action==='resume'&&(!r.record||r.record.id!==r.active!.id||typeof r.record.signatureImage!=='string'))throw Error('Could not open the current JSA.');
 if(operation==='read'&&r.active?.kind==='governed'&&r.record){
  r.record={...r.record,assessmentArchiveUnavailable:true};
  try {
   const [{ownJsaRecords},{adaptGovernedSnapshot}]=await Promise.all([import('./jsaRecord'),import('./sso/jsaArtifactSnapshot')]);
   r.record=enrichResumedJsa(r.record,await ownJsaRecords(),after,adaptGovernedSnapshot);
  } catch { /* Retain verified server record; never substitute current template. */ }
  const final=await loadUsableGovernedSession();
  if(!final||final.uid!==after.uid||final.generation!==after.generation||final.driverId!==after.driverId||final.companyId!==after.companyId)throw Error('Session changed. Reopen JSA.');
 }
 await rememberHome(before,r,operation,startedAt,epoch,order);
 // Fetch the signed read view once per active JSA so desktop Resume also works
 // after service disappears. Status polling cannot repeatedly fetch that view.
 if(operation==='status'&&r.action==='resume'&&!await cachedFor(before,'read')){
  const key=cacheKey(before)+':'+r.shiftId+':'+r.active!.id;
  if(!prefetching.has(key)){prefetching.add(key);void loadJsaHome('read').catch(()=>{}).finally(()=>prefetching.delete(key));}
 }
 return r;
}
