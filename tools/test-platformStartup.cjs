const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText)(n=>{if(n in mocks)return mocks[n];throw Error(n)},m,m.exports);return m.exports;}
const policy=load('services/platformRuntime.generated.ts');const transient=load('services/transientConnection.ts',{'./platformRuntime.generated':policy});const core=load('services/sso/jsaIdentityStartupContract.ts');
(async()=>{
 let session={uid:'u',generation:'g',driverId:'d',companyId:'c'},tokenCalls=0,cleaned=0,published=0;
 let rejectToken;let token=new Promise((_,reject)=>{rejectToken=reject;});
 const user={uid:'u',getIdTokenResult:()=>{tokenCalls++;return token;}};let current=user;
 const auth={awaitGovernedAuthReady:async()=>{},getGovernedAuth:()=>({currentUser:current}),runGovernedIdentityMutation:async f=>f(),cleanupOwnedInstallationWithinMutation:async owner=>{if(session?.generation!==owner.generation)return {ok:false};cleaned++;session=null;current=null;return {ok:true};}};
 const runtime={hasRawGovernedSession:async()=>!!session,loadGovernedSession:async()=>session,installationFinalizedFor:async()=>true,installationMarkerStatus:async()=> 'finalized',publishGovernedSessionReady:()=>published++};
 const api=load('services/sso/jsaIdentityStartupLive.ts',{'../platformRuntime.generated':policy,'../transientConnection':transient,'./jsaGovernedAuthLive':auth,'./jsaRuntime':runtime,'./jsaIdentityStartupContract':core,'./jsaLogoutWatcherLive':{governedBaselineReady:async()=>true}});
 const result=await api.inspectGovernedIdentityStartupDetailed({preferCached:true});assert.equal(result.state,'usable');assert.equal(tokenCalls,1); // Pending token request never delays presentation.
 await api.inspectGovernedIdentityStartupDetailed({preferCached:true});assert.equal(tokenCalls,1); // One background refresh per generation.
 rejectToken({code:'auth/network-request-failed'});await new Promise(r=>setImmediate(r));assert.equal(cleaned,0);assert(session);
 token=Promise.reject({code:'auth/user-disabled'});
 assert.equal((await api.inspectGovernedIdentityStartupDetailed({preferCached:true})).state,'usable');
 await new Promise(r=>setImmediate(r));assert.equal(cleaned,1);assert.equal(published,1);
 console.log('Canonical JSA startup passed: cached-first, coalesced refresh, outage preserved, confirmed revocation retired by owner.');
})().catch(e=>{console.error(e);process.exitCode=1});
