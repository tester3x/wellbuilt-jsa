const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText)(n=>{if(n in mocks)return mocks[n];throw Error(n)},m,m.exports);return m.exports;}
const transient=load('services/transientConnection.ts');
const verified={uid:'u',savedUid:'u',finalized:true,baseline:true,error:{code:'auth/network-request-failed'}};
assert.equal(transient.canRestoreVerifiedOffline(verified),true);
for(const change of [{uid:'other'},{finalized:false},{baseline:false},{error:{code:'auth/user-disabled'}},{error:{code:'functions/permission-denied'}}])assert.equal(transient.canRestoreVerifiedOffline({...verified,...change}),false);
(async()=>{
 let session={uid:'u',generation:'g',companyId:'c',driverId:'d'},launch=null,error=null,allowed=true,gate=null;
 const values=new Map();
 const api=load('services/standaloneJsa.ts',{
  './transientConnection':transient,
  '@react-native-async-storage/async-storage':{getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v),removeItem:async k=>values.delete(k)},
  'firebase/app':{getApp:()=>({})},'expo-crypto':{},
  'firebase/functions':{getFunctions:()=>({}),httpsCallable:()=>async()=>{if(gate)await gate;if(error)throw error;return{data:{allowed,companyId:'c',driverId:'d'}};}},
  './sso/jsaGovernedAuthLive':{loadUsableGovernedSession:async()=>session},
  './sso/jsaRuntime':{loadLaunchContext:async()=>launch},'./sso/jsaArtifactSnapshot':{},
 });
 await api.standaloneAccess(true);assert.equal(values.size,1);
 error={code:'functions/unavailable'};assert.equal(await api.standaloneAccess(),true);
 // A cached view opens while the network refresh is still waiting.
 let release;gate=new Promise(r=>release=r);assert.equal(await api.standaloneAccess(),true);release();gate=null;
 await new Promise(r=>setImmediate(r));
 session={...session,generation:'new'};assert.equal(await api.standaloneAccess(),false);
 session={...session,generation:'g'};error={code:'functions/permission-denied'};
 await assert.rejects(api.standaloneAccess(true));assert.equal(values.size,0);
 error=null;allowed=false;assert.equal(await api.standaloneAccess(true),false);
 allowed=true;gate=new Promise(r=>release=r);const pending=api.standaloneAccess(true);await new Promise(r=>setImmediate(r));session=null;release();await assert.rejects(pending,/Session changed/);assert.equal(values.size,0);
 console.log('Offline session and company-access checks passed: identity, installation, generation, denial, in-flight logout, and immediate cached view.');
})().catch(e=>{console.error(e);process.exitCode=1});
