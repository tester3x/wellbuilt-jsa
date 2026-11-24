export type LegacyEvidenceOwner={uid:string;companyId:string;driverId:string;generation:string|number};
export function createLegacyEvidenceClient(ports:{session():Promise<LegacyEvidenceOwner|null>;call(body:Record<string,unknown>):Promise<any>}){

const same=(a:any,b:any)=>a&&b&&a.uid===b.uid&&a.companyId===b.companyId&&a.driverId===b.driverId&&a.generation===b.generation;
/** No raw REST or caller-supplied authority. Local originals remain the retry source. */
async function legacyEvidenceCall(body:Record<string,unknown>):Promise<any>{
 const owner=await ports.session();if(!owner)throw Error('Sign in to sync saved JSA evidence.');
 if(body.operation==='store'){
  const r=body.record as any;
  if(!r||r.companyId!==owner.companyId||(r.driverId||r.driverHash)!==owner.driverId||r.driverHash&&r.driverHash!==owner.driverId)throw Error('Saved JSA owner is unresolved. The original remains on this phone for recovery.');
 }
 if(!same(owner,await ports.session()))throw Error('JSA session changed. Saved evidence is retained.');
 const result=await ports.call(body);
 if(!same(owner,await ports.session()))throw Error('JSA session changed. Saved evidence is retained.');
 if(result?.schemaVersion!==1)throw Error('JSA delivery is not confirmed.');
 if(body.operation==='store'&&(result.recordId!==(body.record as any)?.id||result.companyId!==owner.companyId||result.driverId!==owner.driverId||typeof result.snapshotHash!=='string'))throw Error('JSA delivery is not confirmed.');
 if(body.operation==='list'&&(result.companyId!==owner.companyId||result.driverId!==owner.driverId||!Array.isArray(result.records)||result.records.some((r:any)=>r.companyId!==owner.companyId||(r.driverId||r.driverHash)!==owner.driverId)))throw Error('JSA history owner mismatch.');
 return result;
}
async function persistLegacyJsaEvidence(record:Record<string,unknown>):Promise<void>{
 const owner=await ports.session();
 await legacyEvidenceCall({operation:'store',record});
 const binding=record.legacyReceiptBinding as any;
 if(binding){
  if(!same(owner,await ports.session()))throw Error('JSA session changed. Saved evidence is retained.');
  // Background recovery uses the same frozen request/record IDs. The server
  // independently verifies job/period/signature timing before publishing.
  const {receipt:r}=await legacyEvidenceCall({operation:'receipt',requestId:binding.requestId,recordId:record.id});
  if(!r||r.requestId!==binding.requestId||r.jsaRecordId!==record.id||r.companyId!==record.companyId||r.driverHash!==(record.driverId||record.driverHash)||r.jobDocId!==binding.jobDocId||r.receiptVersion!==binding.receiptVersion||r.completedAt!==record.timestamp||r.completionType!=='signed_submission')throw Error('JSA receipt is not confirmed. Original evidence retained.');
 }
}

return {legacyEvidenceCall,persistLegacyJsaEvidence};
}
