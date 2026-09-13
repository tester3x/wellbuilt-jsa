const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const cache=new Map(),calls=[];
const sample=(name,api,operator)=>({well_name:name,api_no:api,operator,county:'Test'});
const api={exports:{}};
const js=ts.transpileModule(fs.readFileSync('services/wellData.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
new Function('require','module','exports',js)(name=>{
 if(name.includes('async-storage'))return{getItem:async k=>cache.get(k)||null,setItem:async(k,v)=>cache.set(k,v)};
 if(name==='firebase/app')return{getApp:()=>({})};
 if(name==='firebase/functions')return{getFunctions:()=>({}),httpsCallable:()=>async p=>{calls.push(p);return{data:p.type==='disposals'?[sample('HYDRO CLEAR SWD 1','swd1','Disposal')]:p.type==='wells'?[sample(p.operator==='A'?'GABRIEL 4':'THOR 1',p.operator,p.operator)]:[]};}};
 if(name==='firebase/firestore')return{collection:()=>({}),getDocs:async()=>({docs:[]})};
 if(name==='./firebase')return{db:{}};
 if(name.includes('jsaGovernedAuthLive'))return{loadUsableGovernedSession:async()=>({uid:'u',generation:'g'})};
 throw Error(name);
},api,api.exports);
(async()=>{
 const x=api.exports;
 await x.preloadCompanyWells([]);await x.loadDisposals();
 assert.equal(x.searchWells('hydro clear')[0].locationKind,'swd');
 await x.preloadCompanyWells(['A']);assert.equal(x.searchWells('gabriel')[0].well_name,'GABRIEL 4');
 assert.equal(x.searchWells('hydro').length,1);
 await x.preloadCompanyWells(['B']);assert.equal(x.searchWells('gabriel').length,0);assert.equal(x.searchWells('thor').length,1);
 await x.preloadCompanyWells([]);assert.equal(x.searchWells('thor').length,0);assert.equal(x.searchWells('swd').length,1);
 assert(calls.every(c=>!('companyId' in c)&&!('driverId' in c)));
 console.log('PASS: SWD without operators, combined search, operator changes, empty scope, no client identity');
})().catch(e=>{console.error(e);process.exitCode=1});

