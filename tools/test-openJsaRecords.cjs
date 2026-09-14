const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let session={uid:'u',generation:'g',companyId:'c',driverId:'d'},fail=false;
const rows=[{id:'open',workflow:'standalone',state:'open'},{id:'closed',workflow:'standalone',state:'closed'},{id:'current',shiftId:'2026-09-14_123'},{id:'old',shiftId:'2026-09-13_123'},{id:'unknown',shiftId:'bad'}].map(r=>({...r,companyId:'c',driverId:'d'}));
rows.push({id:'foreign',companyId:'other',driverId:'d',workflow:'standalone',state:'open'});
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('services/jsaRecord.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(n=>{
 if(n==='@react-native-async-storage/async-storage')return{getItem:async()=>JSON.stringify(rows)};
 if(n.endsWith('storageKeys'))return{STORAGE_KEYS:{saves:'s'}};
 if(n.endsWith('jsaGovernedAuthLive'))return{loadUsableGovernedSession:async()=>session};
 if(n.endsWith('jsaGovernedHistoryLookupLive'))return{authenticatedGovernedFirestoreFetch:async()=>({ok:!fail,json:async()=>({fields:{currentShiftId:{stringValue:'2026-09-14_123'}}})})};
 throw Error(n);
},m,m.exports);
(async()=>{let result=await m.exports.ownOpenJsaRecords();assert.deepEqual(result.rows.map(r=>r.id),['open','current']);fail=true;result=await m.exports.ownOpenJsaRecords();assert.deepEqual(result.rows.map(r=>r.id),['open']);assert.equal(result.unverified,true);console.log('Open JSA list: owner filtering, explicit standalone close, verified shift and unavailable authority passed.');})().catch(e=>{console.error(e);process.exitCode=1});
