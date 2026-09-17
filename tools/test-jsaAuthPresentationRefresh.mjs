import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real provider with controlled backend promises and minimal hooks.
const source = fs.readFileSync(new URL('../app/contexts/AuthContext.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020,
  esModuleInterop: true,
}}).outputText;
const flush = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise,resolve}; };
const identity = (name, generation='g1') => ({uid:name,driverId:name,companyId:'test-company',generation,displayName:name,legalName:name});
const inspection = s => ({state:s?'usable':'standalone',binding:s?{uid:s.uid,driverId:s.driverId,companyId:s.companyId}:null});

function harness() {
  const values=[], effects=[]; let listener, epoch=0, stored=null, inspect=async()=>inspection(stored), retired=0;
  let submitRegistration=async()=>({success:true,pending:true,pendingId:'pending-1'}), clearPendingRegistration=async()=>{};
  const context={Provider:Symbol('provider')};let provided;
  const react = {createContext:()=>context,createElement:(type,props)=>{if(type===context.Provider)provided=props.value;return null;},
    useState(value) { const i=values.length; values.push(value); return [value,v=>{values[i]=v;}]; },
    useRef:value=>({current:value}),useCallback:f=>f,useEffect:f=>effects.push(f)};
  const modules = {
    react,
    '../../services/driverAuth': {getPendingRegistration:async()=>null,checkRegistrationStatus:async()=>'pending',
      submitRegistration:(...args)=>submitRegistration(...args),
      clearPendingRegistration:()=>clearPendingRegistration()},
    '../../services/registrationPollGuard': {createRegistrationPollGuard:()=>{
      let generation=0,inFlight=false;
      return {begin:()=>{generation++;inFlight=false;return generation;},invalidate:()=>{generation++;inFlight=false;},
        tryStart:g=>g===generation&&!inFlight?(inFlight=true):false,
        finish:g=>{if(g===generation)inFlight=false;},isCurrent:g=>g===generation};
    }},
    '../../services/sso/jsaRuntime': {
      subscribeGovernedSessionRevision:f=>{listener=f;f(0);return()=>{listener=null;};},
      loadGovernedSession:async()=>stored,
    },
    '../../services/sso/jsaGovernedAuthLive': {currentGovernedIdentityEpoch:()=>epoch},
    '../../services/sso/jsaIdentityStartupLive': {inspectGovernedIdentityStartupDetailed:()=>inspect()},
    '../../services/sso/jsaLegacyAuthRetirementLive': {retireLegacyAuthenticationKeys:async()=>{retired++;return {retired:true};}},
  };
  const exports={};
  vm.runInNewContext(compiled, {exports,require:name=>{assert.ok(modules[name],name);return modules[name];},console,setInterval,clearInterval});
  exports.AuthProvider({children:null});
  const cleanup=effects[0]();
  return {values,cleanup,get retired(){return retired;},
    get api(){return provided;},submit:f=>{submitRegistration=f;},clear:f=>{clearPendingRegistration=f;},
    store:s=>{stored=s;},inspect:f=>{inspect=f;},
    publish:()=>{epoch++;listener?.(epoch);},advance:()=>{epoch++;}};
}
let passed=0;
{
 const h=harness(); await flush(); assert.equal(h.values[0],'login');
 const a=identity('a');h.store(a);h.publish();assert.equal(h.values[1],null);await flush();
 assert.equal(h.values[0],'authenticated');assert.equal(h.values[1].uid,'a');passed++;
 h.store(identity('a','g2'));h.publish();await flush();assert.equal(h.values[1].generation,'g2');passed++;
 h.cleanup();
}
{
 const h=harness();await flush();const delayed=deferred(),a=identity('a'),b=identity('b');
 h.store(a);h.inspect(()=>delayed.promise);h.publish();await flush();
 h.store(b);h.inspect(async()=>inspection(b));h.publish();await flush();
 delayed.resolve(inspection(a));await flush();assert.equal(h.values[1].uid,'b');passed++;h.cleanup();
}
{
 const h=harness();await flush();const delayed=deferred(),a=identity('a');
 h.store(a);h.inspect(()=>delayed.promise);h.publish();await flush();
 h.advance();h.store(null);delayed.resolve(inspection(a));await flush();
 assert.equal(h.values[1],null);assert.notEqual(h.values[0],'authenticated');passed++;h.cleanup();
}
{
 const h=harness();await flush();const before=h.retired;
 h.store(identity('b'));h.inspect(async()=>inspection(identity('a')));h.publish();await flush();
 assert.equal(h.values[0],'error');assert.equal(h.values[1],null);assert.equal(h.retired,before);passed++;h.cleanup();
}
{
 const h=harness();await flush();const delayed=deferred();h.inspect(()=>delayed.promise);h.publish();await flush();
 h.cleanup();const before=JSON.stringify(h.values);delayed.resolve(inspection(identity('a')));await flush();
 assert.equal(JSON.stringify(h.values),before);passed++;
}
{
 const h=harness();await flush();const delayed=deferred();h.submit(()=>delayed.promise);
 const registration=h.api.register('Driver A','secret77','ABCD-2345');await flush();
 h.store(identity('suite-driver'));h.publish();await flush();assert.equal(h.values[0],'authenticated');
 delayed.resolve({success:true,pending:true,pendingId:'pending-a'});assert.equal(await registration,false);await flush();
 assert.equal(h.values[0],'authenticated');assert.equal(h.values[1].uid,'suite-driver');passed++;h.cleanup();
}
{
 const h=harness();await flush();h.clear(async()=>{throw new Error('secure store unavailable');});
 await h.api.cancelRegistration();await flush();assert.equal(h.values[0],'login');
 assert.match(h.values[2],/could not be cleared/);passed++;h.cleanup();
}
{
 const h=harness();await flush();const delayed=deferred();h.clear(()=>delayed.promise);
 const cancellation=h.api.cancelRegistration();h.store(identity('suite-driver'));h.publish();await flush();
 assert.equal(h.values[0],'authenticated');delayed.resolve();await cancellation;await flush();
 assert.equal(h.values[0],'authenticated');assert.equal(h.values[1].uid,'suite-driver');passed++;h.cleanup();
}
console.log(`RESULT passed=${passed} failed=0`);
