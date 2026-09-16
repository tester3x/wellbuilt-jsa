const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const source=ts.transpileModule(fs.readFileSync('app/(tabs)/history.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
async function check({local=[],remote=[],fail=false,authFail=false}){
 const states=[],callbacks=[];let index=0,called=0,focus=false;
 const react={useState:v=>{const i=index++;states[i]=v;return[v,n=>states[i]=n]},useCallback:f=>{callbacks.push(f);return f}};
 const module={exports:{}};
 new Function('require','module','exports',source)(name=>{
  if(name==='react')return react;
  if(name==='react/jsx-runtime')return {jsx:()=>null,jsxs:()=>null};
  if(name==='expo-router')return {useRouter:()=>({}),useFocusEffect:()=>focus=true};
  if(name==='react-native')return {StyleSheet:{create:x=>x}};
  if(name.includes('LanguageContext'))return {useLanguage:()=>({t:x=>x})};
  if(name.includes('ThemeContext'))return {useTheme:()=>({})};
  if(name.includes('constants/colors'))return {colors:{}};
  if(name.endsWith('services/jsaRecord'))return {ownJsaRecords:async()=>{if(authFail)throw Error('signin');return local}};
  if(name.endsWith('services/standaloneJsa'))return {syncStandaloneHistory:async()=>{called++;if(fail)throw Error('offline');return remote}};
  return {};
 },module,module.exports);
 module.exports.default();await callbacks[0]();return {states,called,focus};
}
(async()=>{
 let r=await check({remote:[{id:'server'}]});assert.equal(r.called,1);assert.equal(r.states[0][0].id,'server');assert.equal(r.focus,true);
 r=await check({local:[{id:'cached'}],fail:true});assert.equal(r.states[0][0].id,'cached');assert.match(r.states[3],/Could not refresh/);
 r=await check({fail:true});assert.deepEqual(r.states[0],[]);assert.ok(r.states[3]);
 r=await check({remote:[]});assert.deepEqual(r.states[0],[]);assert.equal(r.states[3],null);
 console.log('4 history refresh cases passed: empty cache downloads; offline retains cache; failed empty is not confirmed empty; successful empty. Focus refresh registered.');
})().catch(e=>{console.error(e);process.exitCode=1});
