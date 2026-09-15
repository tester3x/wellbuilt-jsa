const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const storage=new Map();let owner={uid:'u',companyId:'c',generation:'g'},launch=null;
const api={};const js=ts.transpileModule(fs.readFileSync('services/jsaScreenResume.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
new Function('require','exports',js)(name=>{
 if(name.includes('async-storage'))return {getItem:async k=>storage.get(k),setItem:async(k,v)=>storage.set(k,v)};
 if(name.endsWith('jsaGovernedAuthLive'))return {loadUsableGovernedSession:async()=>owner};
 if(name.endsWith('jsaRuntime'))return {loadLaunchContext:async()=>launch};
 throw Error(name);
},api);
(async()=>{
 await api.rememberJsaScreen('/jsa-record',{id:'saved-1',token:'private',signatureImage:'private',requestId:'old'});
 assert.deepEqual(await api.lastJsaScreen(),{pathname:'/jsa-record',params:{id:'saved-1'}});
 owner={...owner,generation:'refreshed'};assert.equal((await api.lastJsaScreen()).params.id,'saved-1');
 launch={requestId:'required'};assert.equal(await api.lastJsaScreen(),null);
 await api.rememberJsaScreen('/ppe',{id:'required'});launch=null;assert.equal((await api.lastJsaScreen()).params.id,'saved-1');
 owner={...owner,companyId:'other'};assert.equal(await api.lastJsaScreen(),null);
 owner={...owner,companyId:'c',uid:'other'};assert.equal(await api.lastJsaScreen(),null);
 assert.equal(api.resumeScreen('/sso/callback',{code:'secret'}),null);
 assert.equal(api.resumeScreen('/unexpected',{}),null);
 console.log('PASS: screen resume, refreshed session, required-request priority, owner isolation and credential exclusion');
})().catch(e=>{console.error(e);process.exitCode=1});
