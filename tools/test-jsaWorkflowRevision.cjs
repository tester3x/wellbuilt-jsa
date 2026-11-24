const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{execFileSync}=require('node:child_process');
function fixture(){
 const disk=new Map(),cache=new Map();let fail=false;
 const storage={getItem:async k=>disk.get(k)||null,setItem:async(k,v)=>{if(fail)throw Error('storage failed');disk.set(k,v);},removeItem:async k=>{if(fail)throw Error('storage failed');disk.delete(k);}};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
  const relative=path.relative(process.cwd(),file).replaceAll('\\','/');
  const source=process.env.JSA_RUNTIME_REV&&relative==='services/sso/jsaRuntime.ts'?execFileSync('git',['show',process.env.JSA_RUNTIME_REV+':'+relative],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
  const port=n=>{if(n==='@react-native-async-storage/async-storage')return storage;if(n==='expo-secure-store')return{getItemAsync:storage.getItem,setItemAsync:storage.setItem,deleteItemAsync:storage.removeItem};if(n==='react-native')return{NativeModules:{}};if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n.endsWith('.ts')?n:n+'.ts'));return require(n);};
  new Function('module','exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(m,m.exports,port);return m.exports;
 }
 return {runtime:load('services/sso/jsaRuntime.ts'),isolation:load('services/sso/jsaJobDetailsIsolation.ts'),auth:load('services/sso/jsaGovernedAuth.ts'),fail:()=>fail=true};
}
const first='A'.repeat(43),next='B'.repeat(43),view=id=>({requestId:id,state:'pending',intent:'read_and_acknowledge',jobRef:'test-job',groupRef:null,wellName:'Test Well'});
test('same authenticated owner observes replacement launch and successful get without another sign-in',async()=>{
 const f=fixture(),r=f.runtime;await r.saveLaunchContext({requestId:first});await r.markGovernedTerminalFailure(first);
 let state,inspection=0,settle=Promise.resolve();
 const check=async version=>{const [launch,context,marker]=await Promise.all([r.loadLaunchContext(),r.loadRequestContext(),r.loadGovernedTerminalFailure()]);if(version!==inspection)return;state=f.isolation.decideJobDetailsIsolation({resolved:true,authoritySurface:null,explicitGovernedFailure:f.auth.terminalFailureMatches(marker,launch?.requestId),hasGovernedLaunch:!!launch,hasUsableGovernedSession:true,hasMatchingAuthoritativeContext:context?.requestId===launch?.requestId,authPending:false});};
 const stop=r.subscribeGovernedWorkflowRevision(()=>{settle=check(++inspection);});await settle;assert.equal(state.reason,'governed_failed');
 await r.saveLaunchContext({requestId:next});await settle;assert.equal(state.reason,'auth_pending');
 await r.saveRequestContext(view(next));await settle;assert.equal(state.blocked,false);
 await r.markGovernedTerminalFailure(next);await settle;assert.equal(state.reason,'governed_failed');
 await r.clearGovernedTerminalFailureFor(next);await settle;assert.equal(state.blocked,false);
 await r.clearRequestContext();await settle;assert.equal(state.blocked,true);
 stop();
});
test('failed persistence cannot notify readiness, and clearing another request cannot clear a current failure',async()=>{
 const f=fixture(),r=f.runtime;await r.markGovernedTerminalFailure(first);let revision;
 const stop=r.subscribeGovernedWorkflowRevision(n=>revision=n),before=revision;
 assert.equal(await r.clearGovernedTerminalFailureFor(next),false);assert.equal(revision,before);
 f.fail();await assert.rejects(r.saveRequestContext(view(first)),/storage failed/);assert.equal(revision,before);
 await assert.rejects(r.clearGovernedTerminalFailureFor(first),/storage failed/);assert.equal(revision,before);
 assert.equal((await r.loadGovernedTerminalFailure()).requestId,first);stop();
});
test('root subscribes to both identity and durable workflow changes and cleans up both listeners',()=>{
 const source=fs.readFileSync('app/_layout.tsx','utf8');assert(source.includes('unsubscribeWorkflow = subscribeGovernedWorkflowRevision('));assert(source.includes('unsubscribeWorkflow?.()'));
});
