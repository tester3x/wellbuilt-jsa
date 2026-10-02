const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let session={uid:'u',generation:'g',companyId:'c',driverId:'d'},fail=false;
const rows=[
  {id:'open',workflow:'standalone',state:'open'},
  {id:'closed',workflow:'standalone',state:'closed'},
  {id:'current',shiftId:'2026-09-14_123'},
  {id:'old',shiftId:'2026-09-13_123'},
  {id:'signed-old',shiftId:'2026-09-12_123',signedAt:'2026-09-12T12:00:00Z'},
  {id:'unknown',shiftId:'bad'}
].map(r=>({...r,companyId:'c',driverId:'d'}));
rows.push({id:'foreign',companyId:'other',driverId:'d',workflow:'standalone',state:'open'});
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('services/jsaRecord.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(n=>{
 if(n==='@react-native-async-storage/async-storage')return{getItem:async()=>JSON.stringify(rows)};
 if(n.endsWith('storageKeys'))return{STORAGE_KEYS:{saves:'s'}};
 if(n.endsWith('jsaGovernedAuthLive'))return{loadUsableGovernedSession:async()=>session};
 if(n.endsWith('jsaGovernedHistoryLookupLive'))return{authenticatedGovernedFirestoreFetch:async()=>({ok:!fail,json:async()=>({fields:{currentShiftId:{stringValue:'2026-09-14_123'}}})})};
 throw Error(n);
},m,m.exports);
(async()=>{
  let result=await m.exports.ownOpenJsaRecords();
  assert.deepEqual(result.rows.map(r=>r.id),['open','current','old','signed-old','unknown']);
  const curr = result.rows.find(r=>r.id==='current');
  assert.equal(curr.isPriorDayOrphan, false);
  assert.equal(curr.canCloseOrphan, false);
  const old = result.rows.find(r=>r.id==='old');
  assert.equal(old.isPriorDayOrphan, true);
  assert.equal(old.isSigned, false);
  assert.equal(old.canCloseOrphan, false);
  assert.equal(old.canFinish, true);
  assert.equal(old.canDiscard, true);
  const signedOld = result.rows.find(r=>r.id==='signed-old');
  assert.equal(signedOld.isPriorDayOrphan, true);
  assert.equal(signedOld.isSigned, true);
  assert.equal(signedOld.canCloseOrphan, true);
  fail=true;
  result=await m.exports.ownOpenJsaRecords();
  assert.equal(result.unverified,true);
  console.log('Open JSA list: owner filtering, explicit standalone close, verified shift, prior-day orphan recovery, and unavailable authority passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
