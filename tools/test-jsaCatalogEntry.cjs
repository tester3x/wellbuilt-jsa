const fs = require('node:fs'), ts = require('typescript'), assert = require('node:assert/strict');
const compile = source => ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
const source = fs.readFileSync('app/(tabs)/index.tsx','utf8').replace(/\r\n/g,'\n');
const start = source.indexOf('  // Load NDIC well data');
const end = source.indexOf('  // A query entered before',start);
assert(start > 0 && end > start);
const effects = compile(source.slice(start,end));
async function run(selectedOperator, assignedCustomers = [{name:'A'},{name:'B'}]) {
 const calls=[], tasks=[];
 const deps={
  useEffect: fn=>{tasks.push(fn);}, session:{uid:'u',generation:'g'}, selectedOperator,catalogRetry:0,
  setSelectedOperator:()=>{},setOperatorQuery:()=>{},setDriverOperators:()=>{},
  setWellDataLoading:()=>{},setWellDataError:()=>{},setOperatorWellsLoading:()=>{},setWellSuggestions:()=>{},
  fetchDriverProfile:async()=>({assignedCustomers}),
  loadOperators:async()=>{throw Error('assigned choices should not need global catalog');},
  loadDisposals:async()=>{calls.push(['swd']);},
  preloadCompanyWells:async names=>{calls.push(['wells',names]);},console,
 };
 new Function(...Object.keys(deps),effects)(...Object.values(deps));
 tasks.forEach(fn=>fn());
 await new Promise(resolve=>setImmediate(resolve));
 return calls;
}
(async()=>{
 const initial=await run('');
 assert.deepEqual(initial.find(c=>c[0]==='wells'),['wells',[]]);
 assert(initial.some(c=>c[0]==='swd'));
 const empty=await run('', []);
 assert.deepEqual(empty.find(c=>c[0]==='wells'),['wells',[]]);
 assert(!effects.includes('loadOperators'));
 const selected=await run('A');
 assert.deepEqual(selected.find(c=>c[0]==='wells'),['wells',['A']]);
 assert(!effects.includes('configLoaded'));
 assert(!effects.includes('loadAliases'));
 const calendar={};new Function('exports',compile(fs.readFileSync('utils/localCalendarDate.ts','utf8')))(calendar);
 const before=process.env.TZ;process.env.TZ='America/Chicago';
 assert.equal(calendar.localCalendarDate(new Date('2026-09-14T01:10:00Z')),'2026-09-13');
 assert.equal(calendar.localCalendarDate(new Date('2026-01-01T02:00:00Z')),'2025-12-31');
 if(before===undefined)delete process.env.TZ;else process.env.TZ=before;
 assert(!source.includes('new Date().toISOString().slice(0, 10)'));
 console.log('PASS: actual entry loads no well catalog, selected company only, independent SWDs/theme, local evening/year dates');
})().catch(error=>{console.error(error);process.exitCode=1});
