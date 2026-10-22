const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let session={uid:'u',companyId:'c',driverId:'d',generation:1},offline=false,lost=false,failStorage=false,stale=false,responseOverride;
let deliveryOverride,holdReply=false,releaseReply;
const disk=new Map(),accepted=new Map();let count=0;
const record={id:'R'.repeat(43),companyId:'c',driverId:'d',contentHash:'f'.repeat(64),additions:[]};
const fields={location:'Fixture well',operator:'Fixture operator',activity:'Loading',hazards:'Fixture hazard',controls:'Fixture control',ppe:'Gloves'};
function load(){const mod={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('services/standaloneJsa.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText)(name=>{
 if(name==='./platformDelivery')return{platformDelivery:deliveryOverride||{attempt:fn=>fn(),changed:async()=>{}}};
 if(name==='./transientConnection')return{isTransientConnection:()=>false};
 if(name==='firebase/app')return{getApp:()=>({})};
 if(name==='firebase/functions')return{getFunctions:()=>({}),httpsCallable:()=>async body=>{
  if(offline)throw Error('offline');
  if(holdReply)await new Promise(resolve=>releaseReply=resolve);
  if(responseOverride!==undefined)return{data:responseOverride};
  if(body.operation==='append'){
   if(stale)throw Error('review_latest_record');
   if(accepted.has(body.additionId))assert.deepEqual(body,accepted.get(body.additionId));else accepted.set(body.additionId,structuredClone(body));
   if(lost){lost=false;throw Error('response lost');}
   return{data:{record:{...record,additions:[...accepted.keys()].map(id=>({id}))}}};
  }return{data:{records:[]}};
 }};
 if(name==='expo-crypto')return{};
 if(name.endsWith('jsaGovernedAuthLive'))return{loadUsableGovernedSession:async()=>session};
 if(name.endsWith('jsaRuntime'))return{loadLaunchContext:async()=>null,subscribeGovernedSessionRevision:()=>()=>{}};
 if(name.endsWith('jsaArtifactSnapshot'))return{adaptGovernedSnapshot:()=>({ok:true})};
 if(name==='@react-native-async-storage/async-storage')return{getAllKeys:async()=>[...disk.keys()],getItem:async k=>k==='saves'?'[]':disk.get(k)||null,setItem:async(k,v)=>{if(failStorage)throw Error('disk');disk.set(k,v)},removeItem:async k=>disk.delete(k)};
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
 await test('unconfirmed create/close receipts retain durable owner-bound intents',async()=>{
   stale=false;const body={operation:'create',recordId:record.id};
   const queued=()=>JSON.parse(disk.get('@jsa/standalone-delivery-v1')||'[]');
   for(const bad of [{},{ok:false},{record:{...record,id:'wrong'}},{record:{...record,companyId:'other'}}]){
     responseOverride=bad;await assert.rejects(()=>api.standaloneCall(body),/not confirmed/);assert.equal(queued().length,1);
   }
   api=load();responseOverride={record};await api.standaloneCall(body);assert.equal(queued().length,0);
   responseOverride={record:{...record,state:'open'}};await assert.rejects(()=>api.standaloneCall({operation:'close',recordId:record.id}),/not confirmed/);assert.equal(queued().length,1);
   responseOverride={record:{...record,state:'closed'}};await api.standaloneCall({operation:'close',recordId:record.id});assert.equal(queued().length,0);responseOverride=undefined;
 });
 await test('append without its exact addition receipt remains pending',async()=>{
   responseOverride={record};await assert.rejects(()=>api.appendStandaloneLocation(record,'H'.repeat(43),fields),/not confirmed/);assert.equal(pending().length,1);
   responseOverride=undefined;await api.resumePendingStandaloneAddition(record.id);assert.equal(pending().length,0);
 });
 await test('standalone print forwards archived wording and signature',async()=>{
   const assessmentSteps=[{id:'s',title:'Original company wording',items:[]}];
   const projected=JSON.parse(await api.standaloneReportHtml({...record,signedAtMs:1000,snapshot:{printedName:'Fixture Driver',signature:{data:'fixture'},formDate:'2026-09-15'},job:{assessmentSteps,assessmentPpeItems:[{id:'p',label:'Company PPE'}],activity:'Loading',wells:[]}}));
   assert.deepEqual(projected.assessmentSteps,assessmentSteps);assert.equal(projected.signatureImage,'data:image/png;base64,fixture');assert.equal(projected.assessmentPpeItems[0].label,'Company PPE');
 });
 await test('actual scheduler automatically sends on reconnect and retains failed/in-flight intents until exact acknowledgement',async()=>{
   const policy={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync('services/platformRuntime.generated.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(policy,policy.exports);
   let now=1000,timer=null;
   const runtime=policy.exports.createPlatformDeliveryRuntime({now:()=>now,schedule:(run,delay)=>{const current={at:now+delay,run};timer=current;return()=>{if(timer===current)timer=null;};},notifyPending(){}});
   let registered;const register=runtime.register;runtime.register=(name,queue)=>{registered=queue;return register(name,queue);};
   const settle=async()=>{for(let i=0;i<120;i++)await Promise.resolve();};
   deliveryOverride=runtime;runtime.setReachable(false);api=load();const stop=api.installStandaloneDelivery();
   const body={operation:'create',recordId:record.id},queued=()=>JSON.parse(disk.get('@jsa/standalone-delivery-v1')||'[]');
   await assert.rejects(()=>api.standaloneCall(body));await settle();assert.equal(queued().length,1);assert.equal(timer,null);
   assert.equal((await registered.pending()).length,1);
   offline=true;runtime.setReachable(true);await settle();assert.ok(timer);
   const failedWake=timer;now=timer.at;timer=null;failedWake.run();await runtime.drain();await settle();
   assert.equal(queued().length,1,'failed server request remains pending');
   offline=false;responseOverride={record};holdReply=true;
   assert.ok(timer);const retry=timer;now=timer.at;timer=null;retry.run();const draining=runtime.drain();await settle();
   assert.equal(queued().length,1,'in-flight request remains pending');assert.equal(typeof releaseReply,'function');
   releaseReply();await draining;await settle();assert.equal(queued().length,0);assert.equal(timer,null);
   holdReply=false;stop();runtime.stop();deliveryOverride=undefined;responseOverride=undefined;
 });
 console.log(`${count} durable addition cases passed; fixtures only`);
})().catch(e=>{console.error(e);process.exitCode=1});
