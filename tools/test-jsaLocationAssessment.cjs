const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
function load(file){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,p=>load(path.resolve(path.dirname(file),p+'.ts')));return exports;}
const {locationAssessmentFields,selectedAssessmentLabels}=load(path.resolve('services/jsaAssessmentLabels.ts'));
const record={snapshot:{ppeSelected:{'fr-clothing':true,'h2s-monitor':true,'hard-hat':false},ppeOtherItems:['Custom item']},job:{assessmentPpeItems:[{id:'fr-clothing',label:'Company FR clothing'}]}};
const before=JSON.stringify(record),fields=locationAssessmentFields(record);
assert.match(fields.hazards,/company assessment/);assert.match(fields.controls,/company assessment/);assert.equal(fields.ppe,'Company FR clothing, H2S Monitor, Custom item');
assert.deepEqual(locationAssessmentFields(record,{hazards:' Site hazard ',controls:' Site control ',ppe:''}),{hazards:'Site hazard',controls:'Site control',ppe:fields.ppe});
assert.deepEqual(selectedAssessmentLabels({'tools-and-ppe':true,SDS:true}),['Tools And PPE','SDS']);
assert.equal(JSON.stringify(record),before);
const {jsaDocumentHtml}=load(path.resolve('services/jsaDocument.ts'));
const html=jsaDocumentHtml({...record.snapshot,assessmentPpeItems:record.job.assessmentPpeItems,assessmentSteps:[],prepared:{'tools-and-ppe':true}});
assert.ok(html.includes('Company FR clothing'));assert.ok(!html.includes('fr-clothing'));assert.ok(html.includes('Tools And PPE'));
console.log('5 assessment cases passed: reference existing assessment, preserve selected PPE, optional differences, readable labels in report, immutable record.');
