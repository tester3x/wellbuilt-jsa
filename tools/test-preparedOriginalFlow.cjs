const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,imports){const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(`(function(module,exports){${js}\n})(module,module.exports)`,{module:m,require:name=>{if(name in imports)return imports[name];throw Error(name);},Error,Promise,console});return m.exports;}
const fields=load('services/sso/jsaGovernedJobFields.ts',{});
function fixture(){const id='r'.repeat(43),a={packageId:'water',contentHash:'h',tasks:['Production Water'],steps:[{id:'step'}],ppeItems:[],preparedItems:[{id:'ready'}]};
 const f={id,a,request:{job:{jobRef:'job',operator:'Operator',wellName:'Well',jobType:'Production Water',packageId:'water'},grant:{id:'grant',assessments:[a]}},writes:[],drains:0,fail:false};
 f.api=load('services/PreparedJsaFlow.tsx',{'react':{createContext:()=>({}),useContext:()=>null},'./sso/jsaGovernedJobFields':fields,'./preparedShiftJsa':{preparedShiftJsa:{
  readRequest:async id=>id===f.id?f.request:null,record:async(...args)=>{if(f.fail)throw Error('disk failed');f.writes.push(args);},drain:async()=>{f.drains++;}}}});return f;}
test('only the protected native request can populate the actual original screens',async()=>{const f=fixture();const r=await f.api.resolvePreparedRead(f.id);
 assert.equal(r.populate.requestId,f.id);assert.equal(r.handoff.source,'governed_snapshot');assert.equal(r.handoff.wellName,'Well');assert.equal(r.assessment.contentHash,'h');
 await assert.rejects(f.api.resolvePreparedRead('untrusted'));f.request=null;await assert.rejects(f.api.resolvePreparedRead(f.id));});
test('ambiguous frozen assessments refuse rather than substitute current templates',async()=>{const f=fixture();f.request.grant.assessments.push({...f.a});await assert.rejects(f.api.resolvePreparedRead(f.id),/unambiguously/);});
test('a changed grant or assessment cannot submit an old rendered form',async()=>{const f=fixture();await assert.rejects(f.api.recordPreparedRead(f.id,'other','h',{}));
 await assert.rejects(f.api.recordPreparedRead(f.id,'grant','other',{}));assert.equal(f.writes.length,0);assert.equal(f.drains,0);});
test('no return completion on failed local save; exact evidence precedes background delivery',async()=>{const f=fixture();f.fail=true;await assert.rejects(f.api.recordPreparedRead(f.id,'grant','h',{}),/disk failed/);assert.equal(f.drains,0);
 f.fail=false;const snapshot={printedName:'Test name',stepAcks:{step:true},prepared:{ready:true},signature:{data:'test'}};
 const url=await f.api.recordPreparedRead(f.id,'grant','h',snapshot);assert.match(url,/wellbuilt-tickets:\/\/jsa-return/);assert.equal(f.writes[0][0],'job');
 assert.equal(f.writes[0][1],'Operator');assert.equal(f.writes[0][2],'read');assert.equal(f.writes[0][3].snapshot,snapshot);assert.equal(f.drains,1);});
test('the offline entry renders the original screen modules and contains no form replacement',()=>{const s=fs.readFileSync('app/offline-job.tsx','utf8');
 for(const name of ['StepsScreen','PpeScreen','SignoffScreen'])assert.match(s,new RegExp('<'+name+'\\s*/>'));
 assert.doesNotMatch(s,/<Switch|<TextInput|SignatureModal|PreparedJsaForm/);});
