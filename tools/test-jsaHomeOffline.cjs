const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),{test}=require('node:test');
function load(file,require){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(require,m,m.exports);return m.exports;}
const policy=load('services/platformRuntime.generated.ts',()=>{throw Error('unexpected import');});
const settle=()=>new Promise(r=>setImmediate(r));
const base={protocolVersion:1,companyId:'c',driverId:'d',shiftState:'none',shiftId:null,action:'new',active:null};
const opened=(id='A')=>({...base,shiftState:'open',shiftId:'2026-10-19_080000',action:'resume',active:{kind:'governed',id,jsaNumber:'JSA-public'},record:{id,signatureImage:'data:image/png;base64,signature',jobs:[{location:'Original'},{location:'Later'}]}});
function harness(){
 const h={session:{uid:'u',generation:'g',companyId:'c',driverId:'d'},storage:new Map(),calls:[],reply:base,reachable:true,fault:null,handler:null};
 const storage={getItem:async k=>h.storage.get(k)||null,setItem:async(k,v)=>{h.storage.set(k,v);},removeItem:async k=>{h.storage.delete(k);}};
 h.api=load('services/jsaHome.ts',n=>{
  if(n==='@react-native-async-storage/async-storage')return {default:storage};
  if(n==='./platformRuntime.generated')return policy;
  if(n==='./platformDelivery')return {platformDelivery:{attempt:async fn=>{if(!h.reachable)throw {code:'platform/delivery-held'};return fn();}}};
  if(n==='./jsaResumeProjection')return {enrichResumedJsa:r=>r};
  if(n==='./jsaRecord')return {ownJsaRecords:async()=>[]};
  if(n==='./sso/jsaArtifactSnapshot')return {adaptGovernedSnapshot:r=>r};
  if(n==='firebase/app')return {getApp:()=>({})};
  if(n==='firebase/functions')return {getFunctions:()=>({}),httpsCallable:()=>async body=>{h.calls.push(body.operation);if(h.handler)return h.handler(body);if(h.fault)throw h.fault;const r=structuredClone(h.reply);if(body.operation==='status')delete r.record;return {data:r};}};
  if(n.endsWith('jsaGovernedAuthLive'))return {loadUsableGovernedSession:async()=>h.session};throw Error(n);
 });return h;
}

test('last verified status remains available offline without a callable',async()=>{
 const h=harness();await h.api.loadJsaHome();h.reachable=false;const cached=await h.api.loadJsaHome();
 assert.equal(cached.action,'new');assert.equal(cached.offline,true);assert(Number.isFinite(cached.cachedAtMs));assert.deepEqual(h.calls,['status']);
});
test('signed view and all jobs are prefetched once and resumed offline',async()=>{
 const h=harness();h.reply=opened();await h.api.loadJsaHome();await settle();assert.deepEqual(h.calls,['status','read']);
 await h.api.loadJsaHome();await settle();assert.deepEqual(h.calls,['status','read','status']);
 h.reachable=false;const cached=await h.api.loadJsaHome('read');assert.equal(cached.offline,true);assert.equal(cached.record.signatureImage,h.reply.record.signatureImage);assert.equal(cached.record.jobs.length,2);
});
test('a newly active JSA cannot reuse another JSA signed view',async()=>{
 const h=harness();h.reply=opened('A');await h.api.loadJsaHome();await settle();h.reply=opened('B');h.handler=async b=>{if(b.operation==='read')throw {code:'functions/unavailable'};const r=structuredClone(h.reply);delete r.record;return {data:r};};
 await h.api.loadJsaHome();await settle();h.reachable=false;assert.equal(await h.api.readCachedJsaHome('read'),null);await assert.rejects(()=>h.api.loadJsaHome('read'));
 assert.equal((await h.api.readCachedJsaHome()).active.id,'B');
});
test('cache never crosses uid, company or driver and requires a usable identity',async()=>{
 const h=harness();await h.api.loadJsaHome();h.reachable=false;const original=h.session;
 for(const foreign of [{...original,uid:'foreign'},{...original,companyId:'other'},{...original,driverId:'other'},null]){h.session=foreign;assert.equal(await h.api.readCachedJsaHome(),null);await assert.rejects(()=>h.api.loadJsaHome());}
 h.session=original;assert.equal((await h.api.loadJsaHome()).offline,true);
});
test('confirmed permission refusal removes cached presentation; validation never falls back',async()=>{
 const h=harness();await h.api.loadJsaHome();h.reply={...base,companyId:'foreign'};await assert.rejects(()=>h.api.loadJsaHome(),/Could not verify/);
 h.fault={code:'functions/permission-denied'};await assert.rejects(()=>h.api.loadJsaHome());assert.equal(await h.api.readCachedJsaHome(),null);h.reachable=false;await assert.rejects(()=>h.api.loadJsaHome());
});
test('account replacement while a callable is pending cannot cache its reply',async()=>{
 const h=harness();let finish,started;const begun=new Promise(r=>{started=r;});h.handler=()=>new Promise(r=>{finish=r;started();});
 const waiting=h.api.loadJsaHome();await begun;h.session={...h.session,generation:'new'};finish({data:base});await assert.rejects(()=>waiting,/Session changed/);assert.equal(h.storage.size,0);
});
test('an older delayed status cannot overwrite a newer status or signed view',async()=>{
 const h=harness();let finishOld,started;const begun=new Promise(r=>{started=r;});let requests=0;
 h.handler=body=>{if(body.operation==='status'&&++requests===1)return new Promise(r=>{finishOld=r;started();});return Promise.resolve({data:opened('B')});};
 const old=h.api.loadJsaHome();await begun;await h.api.loadJsaHome('read');finishOld({data:base});await old;await settle();
 h.reachable=false;assert.equal((await h.api.loadJsaHome()).active.id,'B');assert.equal((await h.api.loadJsaHome('read')).record.id,'B');
});
