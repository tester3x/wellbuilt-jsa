const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),vm=require('node:vm');
const file='services/sso/jsaArtifactLive.ts',raw=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>n.name?.text==='loadArtifactQueue');assert.ok(fn);
let stored='not-json';const exportsObject={};
vm.runInNewContext(ts.transpileModule(fn.getText(ast),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsObject,GOVERNED_ARTIFACT_QUEUE_KEY:'fixture',AsyncStorage:{getItem:async()=>stored},parseQueueItem:x=>x?.requestId?x:null});
(async()=>{for(const value of ['not-json','{}','[{"unknown":"payload"}]']){stored=value;await assert.rejects(()=>exportsObject.loadArtifactQueue());assert.equal(stored,value);}stored='[]';assert.equal((await exportsObject.loadArtifactQueue()).length,0);console.log('Governed JSA queue: corrupt or unrecognized storage cannot become an empty mutation snapshot.');})().catch(e=>{console.error(e);process.exitCode=1});
