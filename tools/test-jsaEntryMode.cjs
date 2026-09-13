const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const source=fs.readFileSync('app/(tabs)/index.tsx','utf8');
const start=source.indexOf('  const resolveMode = React.useCallback(async () => {');
const end=source.indexOf('  useEffect(() => { resolveMode(); }',start);
assert(start>=0&&end>start);
const js=ts.transpileModule(source.slice(start,end)+'\nexports.run=resolveMode;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
async function run({launch=null,verified=false,id=null,fail=false}){
 const result={};const exports={};
 new Function('exports','require','React','session','isCurrentShiftVerified','AsyncStorage','setIsSsoMode','setSsoShiftId','console',js)(
  exports,()=>({loadLaunchContext:async()=>{if(fail)throw Error('unavailable');return launch;}}),{useCallback:fn=>fn},{uid:'u',generation:'g'},async()=>verified,{getItem:async()=>id},v=>result.required=v,v=>result.shiftId=v,{log:()=>{}});
 await exports.run();return result;
}
(async()=>{
 assert.deepEqual(await run({verified:true,id:'active-shift'}),{required:false,shiftId:null});
 assert.deepEqual(await run({}),{required:false,shiftId:null});
 assert.deepEqual(await run({launch:{requestId:'r'},verified:true,id:'active-shift'}),{required:true,shiftId:'active-shift'});
 assert.deepEqual(await run({launch:{requestId:'r'},verified:false,id:'cached'}),{required:false,shiftId:null});
 assert.deepEqual(await run({fail:true}),{required:false,shiftId:null});
 // Mode alone cannot authorize a standalone form. Required launch isolation
 // and the server-authorized standalone access gate remain in the renderer.
 assert(source.includes('!standaloneAllowed || isSsoMode || !workflowIsolation.mountForm'));
 assert(source.includes('hasGovernedLaunch: !!launch'));
 console.log('PASS: 5 actual entry callback cases and required/standalone form gates');
})().catch(e=>{console.error(e);process.exitCode=1});
