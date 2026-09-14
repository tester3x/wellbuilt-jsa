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
