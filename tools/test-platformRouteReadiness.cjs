const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
async function run(ready){
 let requests=0;const effects=[];const exports={};
 const modules={react:{useEffect:f=>effects.push(f)},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'react-native':{View:()=>null,ActivityIndicator:()=>null},'expo-router':{useRouter:()=>({replace:()=>{}}),useLocalSearchParams:()=>({requestId:'fixture'})},'expo-linking':{getInitialURL:async()=>null},'../constants/colors':{colors:{}},'../modules/wellbuilt-platform/AccountGate':{useAccountReady:()=>ready},'../services/shiftAuthorityStore':{},'../services/sso/jsaStartLive':{reconstructJsaStartUrl:()=> 'jsaapp://start?requestId=fixture',normalizeJsaStartUrl:x=>x,consumeJsaStart:async()=>{requests++;return {kind:'ignored',refusal:'superseded'};}}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/start.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{assert.ok(modules[n],n);return modules[n];},console});
 exports.default();effects.forEach(f=>f());for(let i=0;i<20;i++)await Promise.resolve();return requests;
}
(async()=>{assert.equal(await run(false),0);assert.equal(await run(true),1);console.log('Required JSA requests wait for shared-account adoption before using the SDK.');})().catch(e=>{console.error(e);process.exitCode=1;});
