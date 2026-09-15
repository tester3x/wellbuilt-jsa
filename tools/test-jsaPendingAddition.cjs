const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let session={uid:'u',companyId:'c',driverId:'d',generation:1},offline=false,lost=false,failStorage=false,stale=false;
const disk=new Map(),accepted=new Map();let count=0;
const record={id:'R'.repeat(43),companyId:'c',driverId:'d',contentHash:'f'.repeat(64),additions:[]};
const fields={location:'Fixture well',operator:'Fixture operator',activity:'Loading',hazards:'Fixture hazard',controls:'Fixture control',ppe:'Gloves'};
function load(){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('services/standaloneJsa.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{
 if(name==='firebase/app')return{getApp:()=>({})};
 if(name==='firebase/functions')return{getFunctions:()=>({}),httpsCallable:()=>async body=>{
  if(offline)throw Error('offline');
  if(body.operation==='append'){
   if(stale)throw Error('review_latest_record');
   if(accepted.has(body.additionId))assert.deepEqual(body,accepted.get(body.additionId));else accepted.set(body.additionId,structuredClone(body));
   if(lost){lost=false;throw Error('response lost');}
   return{data:{record}};
  }return{data:{records:[]}};
 }};
 if(name==='expo-crypto')return{};
 if(name.endsWith('jsaGovernedAuthLive'))return{loadUsableGovernedSession:async()=>session};
 if(name.endsWith('jsaRuntime'))return{loadLaunchContext:async()=>null};
 if(name.endsWith('jsaArtifactSnapshot'))return{adaptGovernedSnapshot:()=>({ok:true})};
 if(name==='@react-native-async-storage/async-storage')return{getItem:async k=>k==='saves'?'[]':disk.get(k)||null,setItem:async(k,v)=>{if(failStorage)throw Error('disk');disk.set(k,v)},removeItem:async k=>disk.delete(k)};
 if(name.endsWith('storageKeys'))return{STORAGE_KEYS:{saves:'saves'}};
 if(name==='./jsaDocument')return{jsaDocumentHtml:r=>JSON.stringify(r)};
 throw Error(name);
 },mod,mod.exports);return mod.exports;}
const pending=()=>[...disk.keys()].filter(k=>k.startsWith('jsa.pendingAddition'));
const test=async(n,f)=>{await f();count++;console.log('PASS '+n)};
(async()=>{
 let api=load();
 await test('offline acknowledgement persists before request',async()=>{offline=true;await assert.rejects(()=>api.appendStandaloneLocation(record,'A'.repeat(43),fields),/offline/);assert.equal(pending().length,1);assert.equal(accepted.size,0);offline=false});
 await test('restart replays identical acknowledged request once',async()=>{api=load();await api.resumePendingStandaloneAddition(record.id);assert.equal(accepted.size,1);assert.equal(pending().length,0);assert.equal(accepted.values().next().value.addition.location,fields.location)});
 await test('lost response keeps durable request',async()=>{lost=true;await assert.rejects(()=>api.appendStandaloneLocation(record,'B'.repeat(43),fields),/response lost/);assert.equal(accepted.size,2);assert.equal(pending().length,1)});
 await test('restart after server commit creates no duplicate',async()=>{await load().resumePendingStandaloneAddition(record.id);assert.equal(accepted.size,2);assert.equal(pending().length,0)});
 await test('storage failure sends nothing',async()=>{failStorage=true;await assert.rejects(()=>api.appendStandaloneLocation(record,'C'.repeat(43),fields),/disk/);assert.equal(accepted.size,2);failStorage=false});
 await test('another company cannot replay pending operation',async()=>{offline=true;await assert.rejects(()=>api.appendStandaloneLocation(record,'D'.repeat(43),fields));offline=false;session={...session,companyId:'other'};await api.resumePendingStandaloneAddition(record.id);assert.equal(accepted.size,2);assert.equal(pending().length,1);session={...session,companyId:'c'};await api.resumePendingStandaloneAddition(record.id);assert.equal(accepted.size,3)});
 await test('changed payload cannot replace unconfirmed acknowledgement',async()=>{offline=true;await assert.rejects(()=>api.appendStandaloneLocation(record,'E'.repeat(43),fields));offline=false;await assert.rejects(()=>api.appendStandaloneLocation(record,'F'.repeat(43),{...fields,location:'Changed'}),/earlier addition/);assert.equal(accepted.size,3);await api.resumePendingStandaloneAddition(record.id);assert.equal(accepted.size,4)});
 await test('server requires fresh review clears rejected request',async()=>{stale=true;await assert.rejects(()=>api.appendStandaloneLocation(record,'G'.repeat(43),fields),/review_latest_record/);assert.equal(pending().length,0);assert.equal(accepted.size,4)});
 await test('standalone print forwards archived wording and signature',async()=>{
   const assessmentSteps=[{id:'s',title:'Original company wording',items:[]}];
   const projected=JSON.parse(await api.standaloneReportHtml({...record,signedAtMs:1000,snapshot:{printedName:'Fixture Driver',signature:{data:'fixture'},formDate:'2026-09-15'},job:{assessmentSteps,assessmentPpeItems:[{id:'p',label:'Company PPE'}],activity:'Loading',wells:[]}}));
   assert.deepEqual(projected.assessmentSteps,assessmentSteps);assert.equal(projected.signatureImage,'data:image/png;base64,fixture');assert.equal(projected.assessmentPpeItems[0].label,'Company PPE');
 });
 console.log(`${count} durable addition cases passed; fixtures only`);
})().catch(e=>{console.error(e);process.exitCode=1});
