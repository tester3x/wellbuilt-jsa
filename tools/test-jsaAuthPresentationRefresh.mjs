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
  const react = {createContext:()=>({Provider:'provider'}),createElement:()=>null,
    useState(value) { const i=values.length; values.push(value); return [value,v=>{values[i]=v;}]; },
    useRef:value=>({current:value}),useCallback:f=>f,useEffect:f=>effects.push(f)};
  const modules = {
    react,
    '../../services/driverAuth': {getPendingRegistration:async()=>null},
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
console.log(`RESULT passed=${passed} failed=0`);
