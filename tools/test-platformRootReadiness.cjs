const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/_layout.tsx','utf8');
const ast=ts.createSourceFile('root.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const effects=[];function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect')effects.push(node);ts.forEachChild(node,visit);}visit(ast);
const chosen=effects.filter(n=>{const body=n.arguments[0].getText(ast);return body.includes('subscribeGovernedSessionRevision')||body.includes('const handleDeepLink')||/^\(\) => \{\s*resolveUnauthSurface\(\);\s*\}$/.test(body);});
assert.equal(chosen.length,3);
(async()=>{
 for(const effect of chosen){
  let ready=false,inspection=0,subscriptions=0,unsubscribed=0,links=0,previous,cleanup;
  const logout=()=>{};
  function render(){
   const ctx={platformAccountReady:ready,logout,useEffect:(fn,deps)=>{if(previous&&deps.every((d,i)=>d===previous[i]))return;cleanup?.();previous=deps;cleanup=fn();},resolveUnauthSurface:()=>{if(ready)inspection++;},require:name=>{assert.equal(name,'../services/sso/jsaRuntime');return {subscribeGovernedSessionRevision:fn=>{subscriptions++;fn();return()=>{unsubscribed++;};}};},Linking:{addEventListener:()=>{links++;return {remove(){links--;}};},getInitialURL:async()=>null},AsyncStorage:{setItem:async()=>{}},setSsoInProgress:()=>{}};
   vm.runInNewContext(ts.transpileModule(effect.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,ctx);
  }
  render();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(inspection+subscriptions+links,0,'startup must wait');
  ready=true;render();for(let i=0;i<12;i++)await Promise.resolve();
  const body=effect.arguments[0].getText(ast);
  if(body.includes('subscribeGovernedSessionRevision')){assert.equal(subscriptions,1);assert.equal(inspection,1);}
  else if(body.includes('const handleDeepLink'))assert.equal(links,1);
  else assert.equal(inspection,1,'initial inspection must rerun after adoption');
  cleanup?.();if(subscriptions)assert.equal(unsubscribed,1);if(body.includes('const handleDeepLink'))assert.equal(links,0);
 }
 console.log('Actual root effects wait, resubscribe and inspect on account readiness; no stale false closure.');
})().catch(e=>{console.error(e);process.exitCode=1;});
