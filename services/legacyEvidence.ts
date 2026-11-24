import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';
const same=(a:any,b:any)=>a&&b&&a.uid===b.uid&&a.companyId===b.companyId&&a.driverId===b.driverId&&a.generation===b.generation;
/** No raw REST or caller-supplied authority. Local originals remain the retry source. */
export async function legacyEvidenceCall(body:Record<string,unknown>):Promise<any>{
 const owner=await loadUsableGovernedSession();if(!owner)throw Error('Sign in to sync saved JSA evidence.');
 if(body.operation==='store'){
  const r=body.record as any;
  if(!r||r.companyId!==owner.companyId||(r.driverId||r.driverHash)!==owner.driverId||r.driverHash&&r.driverHash!==owner.driverId)throw Error('Saved JSA owner is unresolved. The original remains on this phone for recovery.');
 }
 const {app}=await import('./firebase');const {getFunctions,httpsCallable}=await import('firebase/functions');
 if(!same(owner,await loadUsableGovernedSession()))throw Error('JSA session changed. Saved evidence is retained.');
 const result=(await httpsCallable(getFunctions(app),'jsaLegacyEvidence',{timeout:15000})(body)).data as any;
 if(!same(owner,await loadUsableGovernedSession()))throw Error('JSA session changed. Saved evidence is retained.');
 if(result?.schemaVersion!==1)throw Error('JSA delivery is not confirmed.');
 if(body.operation==='store'&&(result.recordId!==(body.record as any)?.id||result.companyId!==owner.companyId||result.driverId!==owner.driverId||typeof result.snapshotHash!=='string'))throw Error('JSA delivery is not confirmed.');
 if(body.operation==='list'&&(result.companyId!==owner.companyId||result.driverId!==owner.driverId||!Array.isArray(result.records)||result.records.some((r:any)=>r.companyId!==owner.companyId||(r.driverId||r.driverHash)!==owner.driverId)))throw Error('JSA history owner mismatch.');
 return result;
}
export async function persistLegacyJsaEvidence(record:Record<string,unknown>):Promise<void>{
 const owner=await loadUsableGovernedSession();
 await legacyEvidenceCall({operation:'store',record});
 const binding=record.legacyReceiptBinding as any;
 if(binding){
  if(!same(owner,await loadUsableGovernedSession()))throw Error('JSA session changed. Saved evidence is retained.');
  // Background recovery uses the same frozen request/record IDs. The server
  // independently verifies job/period/signature timing before publishing.
  const {receipt:r}=await legacyEvidenceCall({operation:'receipt',requestId:binding.requestId,recordId:record.id});
  if(!r||r.requestId!==binding.requestId||r.jsaRecordId!==record.id||r.companyId!==record.companyId||r.driverHash!==(record.driverId||record.driverHash)||r.jobDocId!==binding.jobDocId||r.receiptVersion!==binding.receiptVersion||r.completedAt!==record.timestamp||r.completionType!=='signed_submission')throw Error('JSA receipt is not confirmed. Original evidence retained.');
 }
}
