const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let session={uid:'u',generation:'g',companyId:'c',driverId:'d'},body;
const base={protocolVersion:1,companyId:'c',driverId:'d',shiftState:'none',shiftId:null,action:'new',active:null};
let reply=base,change=false;
const cache=new Map();
const m={exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync('services/jsaHome.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(n=>{
 if(n==='@react-native-async-storage/async-storage')return {default:{getItem:async k=>cache.get(k)||null,setItem:async(k,v)=>{cache.set(k,v);},removeItem:async k=>{cache.delete(k);}}};
 if(n==='./platformDelivery')return {platformDelivery:{attempt:f=>f()}};
 if(n==='./platformRuntime.generated')return {classifyPlatformFailure:()=> 'other'};
 if(n==='./jsaResumeProjection')return {enrichResumedJsa:r=>r};
 if(n==='firebase/app')return {getApp:()=>({})};
 if(n==='firebase/functions')return {getFunctions:()=>({}),httpsCallable:()=>async b=>{body=b;if(change)session={...session,generation:'other'};return {data:reply};}};
 if(n.endsWith('jsaGovernedAuthLive'))return {loadUsableGovernedSession:async()=>session};throw Error(n);
},m,m.exports);
(async()=>{
 assert.equal((await m.exports.loadJsaHome()).action,'new');assert.deepEqual(body,{protocolVersion:1,operation:'status'});
 const active={kind:'governed',id:'A'.repeat(43),jsaNumber:'JSA-A'};
 reply={...base,shiftState:'open',shiftId:'2026-10-19_080000',action:'resume',active};assert.equal((await m.exports.loadJsaHome()).action,'resume');
 await assert.rejects(()=>m.exports.loadJsaHome('read'),/Could not open/);
 for(const r of [{...base,action:'resume',active},{...base,companyId:'other'},{...reply,shiftId:'2026-10-19'}]){reply=r;await assert.rejects(()=>m.exports.loadJsaHome(),/Could not verify/);}
 reply=base;change=true;await assert.rejects(()=>m.exports.loadJsaHome(),/Session changed/);
 console.log('JSA home client: authoritative New/Resume, exact scope, read presence, tenant/session isolation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
