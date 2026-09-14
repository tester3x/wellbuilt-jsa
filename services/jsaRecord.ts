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
export async function ownJsaRecord(id:string){const r=(await ownJsaRecords()).find((r:any)=>r.id===id);if(!r)throw new Error('This JSA is not available for the signed-in driver.');return r;}

/** A saved signature alone is not evidence that a Suite shift is still open. */
export async function ownOpenJsaRecords(){
 const session=await loadUsableGovernedSession();if(!session)throw new Error('Sign in first.');
 const rows=await ownJsaRecords();
 const {authenticatedGovernedFirestoreFetch}=await import('./sso/jsaGovernedHistoryLookupLive');
 const openShifts=new Set<string>();
 const shifts=[...new Set<string>(rows.filter((r:any)=>r.workflow!=='standalone'&&typeof r.shiftId==='string').map((r:any)=>r.shiftId))];
 let unverified=false;
 for(const shiftId of shifts){
   const date=/^\d{4}-\d{2}-\d{2}/.exec(shiftId)?.[0];if(!date)continue;
   try{
     const response=await authenticatedGovernedFirestoreFetch(`https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents/driver_shifts/${encodeURIComponent(session.driverId+'_'+date)}`);
     if(!response.ok){unverified=true;continue;}
     const doc=await response.json();if(doc?.fields?.currentShiftId?.stringValue===shiftId)openShifts.add(shiftId);
   }catch{unverified=true;}
 }
 const current=await loadUsableGovernedSession();
 if(!current||current.uid!==session.uid||current.generation!==session.generation||current.companyId!==session.companyId)throw new Error('Session changed. Reopen your JSAs.');
 return {rows:rows.filter((r:any)=>r.state!=='closed'&&(r.workflow==='standalone'?r.state==='open':openShifts.has(r.shiftId))),unverified};
}
