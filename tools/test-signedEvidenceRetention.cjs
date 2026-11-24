const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file){
 let sideEffects=0;const module={exports:{}};
 const effect=()=>{sideEffects++;throw Error('unexpected side effect');};
 const ports=name=>{
  if(name==='firebase/app')return {initializeApp:()=>({})};
  if(name==='firebase/firestore')return {getFirestore:()=>({}),deleteDoc:effect,setDoc:effect,getDocs:effect,doc:effect};
  if(name==='@react-native-async-storage/async-storage')return {default:{getItem:effect,setItem:effect,removeItem:effect}};
  if(name==='react-native')return {Platform:{OS:'android'}};
  return {};
 };
 new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,ports);
 return {api:module.exports,get sideEffects(){return sideEffects;}};
}
test('legacy delete-everywhere cannot remove the local original, even when cloud access would fail',async()=>{
 const f=load('services/sync.ts');await assert.rejects(f.api.deleteJSAEverywhere('synthetic-signed-record'),/retained as safety evidence/);assert.equal(f.sideEffects,0);
});
test('direct cloud-delete export refuses before any document or network operation',async()=>{
 const f=load('services/firebase.ts');await assert.rejects(f.api.deleteJSAFromCloud('synthetic-signed-record'),/cannot be deleted/);assert.equal(f.sideEffects,0);
});
test('saved-report screen keeps lifecycle Close separate from evidence deletion',()=>{
 const source=fs.readFileSync('app/(tabs)/history.tsx','utf8');assert.match(source,/const retained = !standalone/);assert.ok(!source.includes('deleteJSAEverywhere'));assert.ok(source.includes('closeStandaloneJsa(item)'));
});
