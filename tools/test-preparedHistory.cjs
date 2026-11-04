const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const {createPreparedJsaRuntime}=require('../modules/wellbuilt-platform/preparedJsa');
function leaf(file){const m={exports:{}};new Function('module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(m,m.exports);return m.exports;}
const {projectPreparedJsaHistory,mergePreparedHistory}=leaf('services/preparedJsaHistory.ts');
function fixture(){
 const disk=new Map(),owner={uid:'uid',companyId:'company',driverId:'driver',grantId:'login'};let now=100,count=0;
 const a={contentHash:'hash',steps:[{id:'s',title:'Original frozen assessment',items:[]}],preparedItems:[{id:'p'}],ppeItems:[]};
 const g={version:1,id:'a'.repeat(64),companyId:'company',driverId:'driver',shiftId:'2026-11-01_090000',binding:{jsaPeriodId:'period'},issuedAtMs:1,expiresAtMs:1000,mode:'per_job',allowAcknowledge:true,operators:['Operator'],assessments:[a]};
 const runtime=createPreparedJsaRuntime({owner:async()=>owner,now:()=>now,mint:async()=>String(++count).padStart(43,'r'),hash:async()=>'',call:async()=>({version:1,grant:g}),
 store:{keys:async()=>[...disk.keys()],read:async k=>disk.get(k)||null,write:async(k,v)=>{disk.set(k,v);},writeBatch:async rows=>rows.forEach(r=>disk.set(r.key,r.value))}});
 return {runtime,disk,g,a,owner,setNow:n=>now=n};
}
test('November signed read remains in historical list after end, expiry, login refresh and restart; ACK is not a second signature',async()=>{
 const f=fixture();await f.runtime.preload();await f.runtime.request({jobRef:'job',operator:'Operator',wellName:'Well 1',jobType:'Water'});
 await f.runtime.record('job','Operator','read',{assessmentHash:'hash',snapshot:{printedName:'Driver',stepsAcknowledged:true,stepAcks:{s:true},prepared:{p:true},signature:{mimeType:'image/png',data:'iVBORw0KGgo='},formDate:'2026-11-01'}});
 await f.runtime.record('job2','Operator','acknowledged');await f.runtime.endShift(f.g.shiftId);f.setNow(2000);f.owner.grantId='refreshed-login';
 const before=[...f.disk.entries()],reports=projectPreparedJsaHistory(await f.runtime.history(),f.owner);
 assert.equal(reports.length,1);assert.equal(reports[0].date,'2026-11-01');assert.equal(reports[0].wellName,'Well 1');
 assert.equal(reports[0].assessmentSteps[0].title,'Original frozen assessment');assert.equal(reports[0].signatureImage,'data:image/png;base64,iVBORw0KGgo=');
 assert.equal(reports[0].workflow,'prepared');assert.equal(reports[0].coveredJobs.length,2);assert.deepEqual([...f.disk.entries()],before);
 await assert.rejects(f.runtime.inspect('job','Operator')); // history never authorizes a new job
 f.owner.driverId='foreign';assert.deepEqual(await f.runtime.history(),[]);
});
test('local frozen assessment wins over cloud authored-only projection, without duplicating or changing legacy records',()=>{
 const legacy={id:'legacy',signatureImage:'old',workflow:'standalone'},cached={id:'signed',assessmentArchiveUnavailable:true},local={id:'signed',assessmentSteps:[{title:'Frozen'}]};
 const rows=mergePreparedHistory([legacy],[cached],[local]);assert.equal(rows.length,2);assert.equal(rows.find(r=>r.id==='signed'),local);assert.equal(rows.find(r=>r.id==='legacy'),legacy);
});
test('foreign owner and mismatched frozen assessment are refused',()=>{
 const e={companyId:'company',driverId:'driver',grantId:'a',kind:'read',occurredAtMs:1,snapshot:{signature:{data:'png'}}},g={companyId:'company',driverId:'driver',id:'a',assessments:[]};
 assert.deepEqual(projectPreparedJsaHistory([{event:e,grant:g}],{companyId:'company',driverId:'driver'}),[]);
 assert.deepEqual(projectPreparedJsaHistory([{event:e,grant:g}],{companyId:'company',driverId:'other'}),[]);
});
