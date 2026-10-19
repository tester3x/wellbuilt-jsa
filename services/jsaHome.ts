import {enrichResumedJsa} from './jsaResumeProjection';
import {getApp} from 'firebase/app';
import {getFunctions,httpsCallable} from 'firebase/functions';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';
export type JsaHomeState={protocolVersion:1;companyId:string;driverId:string;shiftState:'open'|'none';shiftId:string|null;action:'new'|'resume';active:null|{kind:'governed'|'standalone';id:string;jsaNumber:string|null};record?:any};
export async function loadJsaHome(operation:'status'|'read'='status'):Promise<JsaHomeState>{
 const before=await loadUsableGovernedSession();if(!before)throw Error('Sign in to WellBuilt JSA first.');
 const result=await httpsCallable(getFunctions(getApp()),'jsaHomeState',{timeout:35000})({protocolVersion:1,operation});
 const after=await loadUsableGovernedSession();
 if(!after||before.uid!==after.uid||before.generation!==after.generation||before.driverId!==after.driverId||before.companyId!==after.companyId)throw Error('Session changed. Reopen JSA.');
 const r=result.data as JsaHomeState;
 if(!r||r.protocolVersion!==1||r.driverId!==after.driverId||r.companyId!==after.companyId||!['open','none'].includes(r.shiftState)||!['new','resume'].includes(r.action)
   ||(r.shiftState==='open'&&(typeof r.shiftId!=='string'||!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(r.shiftId)))
   ||(r.shiftState==='none'&&(r.shiftId!==null||r.action!=='new'||r.active!==null))
   ||(r.action==='resume'&&(!r.active||!['governed','standalone'].includes(r.active.kind)||typeof r.active.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(r.active.id)))
   ||(r.action==='new'&&r.active!==null))throw Error('Could not verify JSA status.');
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
 return r;
}
