const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function fixture(){
 const disk=new Map(),calls=[],session={uid:'u',companyId:'c',driverId:'d',generation:1};let current=session,foreign=false,fail=false,change=false;
 const m={exports:{}},key='cache/'+encodeURIComponent(JSON.stringify(['u','c','d']));
 const ports=name=>{
  if(name==='@react-native-async-storage/async-storage')return {default:{getItem:async k=>disk.get(k)||null,setItem:async(k,v)=>disk.set(k,v)}};
  if(name==='firebase/functions')return {getFunctions:()=>({}),httpsCallable:()=>async body=>{
   calls.push(body);if(fail)throw Error('offline');if(change)current={...session,generation:2};
   return {data:{schemaVersion:1,companyId:'c',driverId:foreign?'other':'d',...body,missing:[],records:[
    {id:'nov-read',source:'governed',kind:'jsa_read',date:'2026-11-01',completedAt:'2026-11-01T12:00:00Z',record:{printedName:'Original name',signatureImage:'data:image/png;base64,saved'}},
    {id:'nov-ack',source:'job_acknowledgment',kind:'jsa_ack',date:'2026-11-01',completedAt:'2026-11-01T13:00:00Z',record:{}}
   ]}};
  }};
  if(name==='./firebase')return {app:{}};
  if(name==='./sso/jsaGovernedAuthLive')return {loadUsableGovernedSession:async()=>current};
  if(name==='./jsaRecord')return {PREPARED_HISTORY_CACHE:'cache/',ownJsaRecords:async()=>[{date:'2026-10-30'}]};
  throw Error(name);
 };
 class Clock extends Date{constructor(...args){super(...(args.length?args:['2026-11-04T12:00:00Z']));}}
 new Function('module','exports','require','Date',ts.transpileModule(fs.readFileSync('services/preparedJsaHistoryLive.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,ports,Clock);
 return {disk,key,calls,api:m.exports,foreign:()=>foreign=true,offline:()=>fail=true,change:()=>change=true};
}
test('read-only cloud refresh covers October cutoff through November, restores original signature and deduplicates export pages',async()=>{
 const f=fixture();await f.api.syncPreparedJsaHistory();const rows=JSON.parse(f.disk.get(f.key));
 assert.equal(rows.length,1);assert.equal(rows[0].id,'nov-read');assert.equal(rows[0].signatureImage,'data:image/png;base64,saved');assert.equal(rows[0].workflow,'prepared');
 assert.equal(rows[0].assessmentArchiveUnavailable,true);assert.equal(f.calls[0].startDate,'2026-10-30');assert.equal(f.calls.at(-1).endDate,'2026-11-04');
 await f.api.syncPreparedJsaHistory();assert.equal(JSON.parse(f.disk.get(f.key)).length,1);
});
test('foreign cloud reply, changed login and offline refresh cannot overwrite retained reports',async()=>{
 for(const mode of ['foreign','change','offline']){const f=fixture();f.disk.set(f.key,'[{"id":"retained"}]');f[mode]();await assert.rejects(f.api.syncPreparedJsaHistory());assert.equal(f.disk.get(f.key),'[{"id":"retained"}]');}
});
