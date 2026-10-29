const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(){
 let ready=false,id='r'.repeat(43),reads=0,fail=false,release=null,proofs=0,returns=0;
 let cursor=0;const slots=[],effects=[],pending=[];
 const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState:initial=>{const n=cursor++;if(!(n in slots))slots[n]=initial;return [slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},
  useMemo:fn=>fn(),useEffect:(fn,deps)=>{const n=cursor++,old=effects[n];
   if(!old||deps.some((d,i)=>d!==old.deps[i])){old?.cleanup?.();effects[n]={deps};pending.push(()=>{effects[n].cleanup=fn();});}}};
 const current={request:{job:{jobRef:'job',operator:'Operator',wellName:'Well',jobType:'Production Water',truckNumber:'102'},grant:{id:'grant',policyDay:'2026-10-29'}},
  assessment:{contentHash:'frozen',steps:[{id:'step'}]}};
 const modules={react,'react-native':{ActivityIndicator:'Spinner',BackHandler:{addEventListener:()=>({remove(){}})},
  Linking:{openURL:async()=>{returns++;}},Pressable:'Button',Text:'Text',View:'View'},
  'expo-router':{Stack:{Screen:'Screen'},useLocalSearchParams:()=>({requestId:id})},
  '@react-native-async-storage/async-storage':{getItem:async()=>null},
  '../modules/wellbuilt-platform/AccountGate':{useAccountReady:()=>ready},
  '../services/PreparedJsaFlow':{PreparedReadContext:{Provider:'PreparedProvider'},resolvePreparedRead:async()=>{reads++;if(release)await new Promise(r=>{release=r;});if(fail)throw Error('not yet ready');return current;},recordPreparedRead:async()=>{}},
  '../services/preparedShiftJsa':{preparedShiftJsa:{proof:async()=>{proofs++;return null;}}},
  '../services/sso/jsaAttestationScope':{readAttestationDraft:async()=>({stepAcks:{}}),writeAttestationDraft:async()=>true},
  '../services/driverAuth':{fetchDriverProfile:async()=>null},
  './steps':()=>null,'./ppe':()=>null,'./signoff':()=>null,'./contexts/ThemeContext':{useTheme:()=>({accent:'gold'})}};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/offline-job.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,
  {exports,require:name=>{assert.ok(Object.hasOwn(modules,name),name);return modules[name];},console,Error});
 async function settle(){for(let i=0;i<30;i++)await Promise.resolve();}
 function render(){cursor=0;const tree=exports.default();pending.splice(0).forEach(fn=>fn());return tree;}
 function button(tree){if(!tree||typeof tree!=='object')return null;if(tree.type==='Button')return tree;for(const child of tree.props?.children||[]){if(Array.isArray(child)){for(const c of child){const b=button(c);if(b)return b;}}else{const b=button(child);if(b)return b;}}return null;}
 return {render,settle,button,current,get reads(){return reads;},get proofs(){return proofs;},get returns(){return returns;},
  ready:v=>{ready=v;},fail:v=>{fail=v;},id:v=>{id=v;},delay:()=>{release=true;},resume:()=>{release();release=null;}};
}
test('same first job waits for account restoration then opens original populated flow without a second Tickets launch',async()=>{
 const h=harness();h.render();await h.settle();assert.equal(h.reads,0);
 h.ready(true);h.render();await h.settle();const tree=h.render();
 assert.equal(h.reads,1);assert.equal(tree.type,'PreparedProvider');assert.equal(tree.props.value.params.wellName,'Well');
 assert.equal(tree.props.value.params.truckNumber,'102');assert.equal(h.returns,0);
});
test('retry retains the protected request rather than creating a standalone JSA',async()=>{
 const h=harness();h.ready(true);h.fail(true);h.render();await h.settle();let tree=h.render();
 assert.notEqual(tree.type,'PreparedProvider');const retry=h.button(tree);assert.ok(retry);
 h.fail(false);retry.props.onPress();h.render();await h.settle();tree=h.render();
 assert.equal(tree.type,'PreparedProvider');assert.equal(h.reads,2);assert.equal(h.returns,0);
});
test('superseded first request cannot return a completion or query proof after delayed owner read',async()=>{
 const h=harness();h.ready(true);h.delay();h.render();await h.settle();h.id('s'.repeat(43));
 // Clean up the old request, leave the new request waiting for account restoration.
 h.ready(false);h.render();h.resume();await h.settle();
 assert.equal(h.proofs,0);assert.equal(h.returns,0);assert.notEqual(h.render().type,'PreparedProvider');
});
