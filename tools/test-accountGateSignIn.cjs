const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function gate(){
 const slots=[],effects=[],events={};let index=0,tree,restore=async()=>{throw Object.assign(Error('Signed out'),{code:'platform/signed-out'});};
 const react={createContext:()=>({Provider:'Provider'}),Fragment:'Fragment',
  createElement:(type,props,...children)=>({type,props:{...props,children}}),
  useState:value=>{const at=index++;if(!(at in slots))slots[at]=value;return [slots[at],next=>{slots[at]=typeof next==='function'?next(slots[at]):next;}];},
  useRef:value=>{const at=index++;if(!(at in slots))slots[at]={current:value};return slots[at];},
  useCallback:(fn,deps)=>{const at=index++;const old=slots[at];if(!old||deps.some((x,i)=>x!==old.deps[i]))slots[at]={fn,deps};return slots[at].fn;},
  useEffect:(fn,deps)=>{const at=index++;const old=slots[at];if(!old||deps.some((x,i)=>x!==old[i])){slots[at]=deps;effects.push(fn);}}};
 const native={addListener:(name,fn)=>{events[name]=fn;return {remove(){}};}};
 const mocks={react,'react-native':{View:'View',Text:'Text',Pressable:'Button',ActivityIndicator:'Spinner',AppState:{addEventListener:(name,fn)=>{events.app=fn;return {remove(){}};}}},
  './index':native,'./accountRecovery':{restoreWithRecovery:({restore})=>restore()},
  './delivery':{subscribePending:()=>()=>{}},'expo-splash-screen':{hideAsync:async()=>{}}};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync('modules/wellbuilt-platform/AccountGate.js','utf8'),{module,require:name=>{assert(name in mocks,name);return mocks[name];},console,setTimeout,clearTimeout});
 const props={restore:()=>restore(),clearLocal:async()=>{},children:{type:'Login'}};
 function render(){index=0;tree=module.exports(props);while(effects.length)effects.shift()();return tree;}
 function nodes(node){return !node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(nodes):[node,...nodes(node.props?.children)];}
 function button(label){return nodes(tree).find(n=>n.type==='Button'&&nodes(n).some(c=>c.type==='Text'&&c.props.children[0]===label));}
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 return {render,button,events,flush,setRestore:fn=>{restore=fn;},props,
  loginVisible:()=>nodes(tree).some(n=>n.type==='View'&&n.props.pointerEvents==='auto'),
  ready:()=>tree.props.value};
}
test('Sign in survives foreground, connection and signed-out account events until real sign-in',async()=>{
 const g=gate();g.render();await g.flush();g.render();
 assert.equal(g.button('Retry'),undefined,'signed-out state should not offer a futile retry');
 await g.button('Sign in').props.onPress();g.render();assert(g.loginVisible());assert.equal(g.ready(),true);
 for(const send of [()=>g.events.app('active'),()=>g.events.accountChanged({}),()=>g.events.connectionChanged({reachable:true})]){
  send();await g.flush();g.render();assert(g.loginVisible(),'background signed-out check must not hide login');assert.equal(g.ready(),true);
 }
 g.setRestore(async()=> 'restored');g.events.accountChanged({});await g.flush();g.render();assert(g.loginVisible());assert.equal(g.ready(),true);
});

test('interactive sign-in lets the real JSA auth startup reach login without creating an identity',async()=>{
 const ts=require('typescript');
 const source=ts.createSourceFile('AuthContext.tsx',fs.readFileSync('app/contexts/AuthContext.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let effect,check;
 function visit(node){
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='useEffect'&&node.arguments[0]?.getText(source).includes('subscribeGovernedSessionRevision'))effect=node.arguments[0];
  if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='checkInitialState')check=node.initializer;
  ts.forEachChild(node,visit);
 }
 visit(source);assert(effect&&check,'exercise actual subscription and identity inspection');
 const js=ts.transpileModule('const checkInitialState = '+check.getText(source)+'; const effect = '+effect.getText(source)+'; effect();',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const g=gate();g.render();await g.flush();g.render();
 let mode='checking',session='unchecked',subscriptions=0;
 const mocks={
  '../../services/sso/jsaRuntime':{subscribeGovernedSessionRevision:callback=>{subscriptions++;callback();return ()=>{};}},
  '../../services/sso/jsaGovernedAuthLive':{currentGovernedIdentityEpoch:()=>1},
  '../../services/sso/jsaIdentityStartupLive':{inspectGovernedIdentityStartupDetailed:async()=>({state:'standalone'})},
  '../../services/sso/jsaLegacyAuthRetirementLive':{retireLegacyAuthenticationKeys:async()=>({retired:true})}
 };
 const context=()=>({platformAccountReady:g.ready(),identityReadRef:{current:0},pollRef:{current:null},registrationAttemptRef:{current:0},
  registrationPollGuardRef:{current:{invalidate(){}}},
  setSession:value=>{session=value;},setMode:value=>{mode=value;},setError:()=>{},
  getPendingRegistration:async()=>null,require:name=>{assert(name in mocks,name);return mocks[name];},console});
 vm.runInNewContext(js,context());await g.flush();assert.equal(subscriptions,0);
 await g.button('Sign in').props.onPress();g.render();
 vm.runInNewContext(js,context());await g.flush();
 assert.equal(subscriptions,1);assert.equal(mode,'login');assert.equal(session,null);
});
test('late signed-out failure cannot cover a newly requested login; access denial still blocks',async()=>{
 const g=gate();g.render();await g.flush();g.render();
 let reject;g.setRestore(()=>new Promise((_,fail)=>{reject=fail;}));g.events.accountChanged({});
 // Existing signed-out screen still has a sign-in callback while its recheck is pending.
 g.render();g.setRestore(async()=>{throw Object.assign(Error('Signed out'),{code:'platform/signed-out'});});
 // Start with another explicit error state, then race foreground against Sign in.
 reject(Object.assign(Error('Signed out'),{code:'platform/signed-out'}));await g.flush();g.render();
 const sign=g.button('Sign in').props.onPress;
 g.setRestore(()=>new Promise((_,fail)=>{reject=fail;}));g.events.app('active');await sign();g.render();
 reject(Object.assign(Error('Signed out'),{code:'platform/signed-out'}));await g.flush();g.render();assert(g.loginVisible());
 g.setRestore(async()=>{throw Object.assign(Error('Access denied'),{code:'platform/access-denied'});});g.events.accountChanged({});await g.flush();g.render();assert.equal(g.loginVisible(),false);
});
