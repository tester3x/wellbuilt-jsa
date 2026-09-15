const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
const data=new Map();let owner={uid:'u',companyId:'c',generation:'g'},launch=null;
function load(){const out={};new Function('exports','require',ts.transpileModule(fs.readFileSync('services/jsaTaskSelectionDraft.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(out,n=>n.includes('async-storage')?{getItem:async k=>data.get(k)||null,setItem:async(k,v)=>data.set(k,v)}:n.endsWith('jsaGovernedAuthLive')?{loadUsableGovernedSession:async()=>owner}:{loadLaunchContext:async()=>launch});return out;}
const selection={templateRefs:[{id:'load',version:1,contentHash:'a'.repeat(64)}],templates:[{id:'load'}],steps:[{id:'one'}],ppeItems:[],preparedItems:[]};
(async()=>{let api=load();assert.equal(await api.loadTaskSelectionDraft('first'),null);await api.freezeTaskSelectionDraft('first',selection);
 api=load();assert.deepEqual(await api.loadTaskSelectionDraft('first'),selection);assert.equal(await api.loadTaskSelectionDraft('second'),null);
 owner={...owner,generation:'refresh'};assert.deepEqual(await api.loadTaskSelectionDraft('first'),selection);
 await assert.rejects(()=>api.freezeTaskSelectionDraft('first',{...selection,steps:[{id:'changed'}]}),/already/);
 await api.freezeTaskSelectionDraft('first',selection);
 owner={...owner,uid:'other'};assert.equal(await api.loadTaskSelectionDraft('first'),null);
 owner={...owner,uid:'u',companyId:'other'};assert.equal(await api.loadTaskSelectionDraft('first'),null);
 launch={requestId:'required'};await assert.rejects(()=>api.loadTaskSelectionDraft('first'),/standalone/);
 console.log('PASS: restart restoration, refreshed auth, separate JSA/user/company scopes, immutable choice and required-handoff isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
