const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function fixture(){
 const state={owner:{uid:'synthetic-user',companyId:'synthetic-company',driverId:'synthetic-driver',generation:1},calls:[],offline:false,afterCall:()=>{},reply:null};
 const m={exports:{}};const ports=name=>{
  if(name==='./legacyEvidenceCore'){const core={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('services/legacyEvidenceCore.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(core,core.exports);return core.exports;}
  if(name==='./sso/jsaGovernedAuthLive')return {loadUsableGovernedSession:async()=>({...state.owner})};
  if(name==='./firebase')return {app:{}};
  if(name==='firebase/functions')return {getFunctions:()=>({}),httpsCallable:(_f,name)=>async body=>{assert.equal(name,'jsaLegacyEvidence');state.calls.push(structuredClone(body));if(state.offline)throw Error('network unavailable');const result=state.reply||{schemaVersion:1,companyId:state.owner.companyId,driverId:state.owner.driverId,recordId:body.record?.id,snapshotHash:'synthetic-digest'};state.afterCall();return {data:result};}};
  throw Error(name);
 };
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync('services/legacyEvidence.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,ports);
 return {api:m.exports,state};
}
const record={id:'signed-original',companyId:'synthetic-company',driverId:'synthetic-driver',timestamp:'2026-11-24T12:00:00Z',signature:'synthetic signature'};
test('transport failure preserves signed payload and stable replay ID/time',async()=>{
 const f=fixture(),original=JSON.stringify(record);f.state.offline=true;await assert.rejects(f.api.persistLegacyJsaEvidence(record),/network/);assert.equal(JSON.stringify(record),original);f.state.offline=false;await f.api.persistLegacyJsaEvidence(record);assert.deepEqual(f.state.calls[0],f.state.calls[1]);
});
test('foreign and unknown historical owners stay local without server calls',async()=>{
 for(const r of [{...record,companyId:'foreign'},{...record,driverId:'foreign'},{id:'unknown',signature:'synthetic'}]){const f=fixture();await assert.rejects(f.api.persistLegacyJsaEvidence(r),/owner is unresolved/);assert.equal(f.state.calls.length,0);}
});
test('response after account switch cannot confirm or reassign old owner evidence',async()=>{
 const f=fixture();f.state.afterCall=()=>{f.state.owner={...f.state.owner,uid:'other-user',driverId:'other-driver'};};await assert.rejects(f.api.persistLegacyJsaEvidence(record),/session changed/);assert.equal(f.state.calls[0].record.driverId,'synthetic-driver');
});
test('mismatched archive acknowledgement cannot confirm pending evidence',async()=>{
 const f=fixture();f.state.reply={schemaVersion:1,recordId:'other',companyId:record.companyId,driverId:record.driverId,snapshotHash:'digest'};await assert.rejects(f.api.persistLegacyJsaEvidence(record),/not confirmed/);
});

test('background replay publishes the frozen receipt only after archive and retains it on failure',async()=>{
 const f=fixture(),binding={requestId:'R'.repeat(43),jobDocId:'synthetic-job',receiptVersion:1};
 const r={...record,legacyReceiptBinding:binding},original=JSON.stringify(r);
 // Archive succeeds but an unconfirmed receipt cannot turn the retry into success.
 await assert.rejects(f.api.persistLegacyJsaEvidence(r),/receipt is not confirmed/);
 assert.deepEqual(f.state.calls.map(x=>x.operation),['store','receipt']);
 assert.equal(JSON.stringify(r),original);
 f.state.calls=[];
 f.state.reply={schemaVersion:1,companyId:r.companyId,driverId:r.driverId,recordId:r.id,snapshotHash:'digest',receipt:{...binding,jsaRecordId:r.id,companyId:r.companyId,driverHash:r.driverId,completedAt:r.timestamp,completionType:'signed_submission'}};
 await f.api.persistLegacyJsaEvidence(r);
 assert.deepEqual(f.state.calls.map(x=>x.operation),['store','receipt']);
 assert.equal(JSON.stringify(r),original);
});
test('receipt response must match record, request, owner and job, not merely exist',async()=>{
 let response={schemaVersion:1,receipt:{requestId:'R'.repeat(43),receiptVersion:1,jsaRecordId:record.id,companyId:record.companyId,driverHash:record.driverId,jobDocId:'synthetic-job',shiftId:'synthetic-shift',completionType:'signed_submission'}};
 const m={exports:{}},ports=name=>{if(name==='@react-native-async-storage/async-storage')return {default:{}};if(name==='./legacyEvidence')return {legacyEvidenceCall:async()=>response};throw Error(name);};
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync('services/wbtReadRequest.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,ports);
 const ctx={requestId:'R'.repeat(43),receiptVersion:1,companyId:record.companyId,driverHash:record.driverId,jobDocId:'synthetic-job',shiftId:'synthetic-shift'};
 assert.equal(await m.exports.writeReadReceipt(ctx,record.id),true);response={...response,receipt:{...response.receipt,jsaRecordId:'other'}};assert.equal(await m.exports.writeReadReceipt(ctx,record.id),false);
});
