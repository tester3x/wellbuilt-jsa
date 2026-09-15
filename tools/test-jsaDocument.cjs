const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
function load(file){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;new Function('exports','require',code)(exports,p=>load(path.resolve(path.dirname(file),p+'.ts')));return exports;}
const {jsaDocumentHtml,signingTime}=load(path.resolve(__dirname,'../services/jsaDocument.ts'));
const record={id:'fixture-only',operator:'Example customer',driverName:'Example Driver',truckNumber:'Test truck',date:'2026-09-14',timestamp:'2026-09-14T12:00:00Z',signature:'Example Driver',signatureImage:'data:image/png;base64,aGVsbG8=',wells:[{name:'Site <A>',jobType:'Service'}],ppeSelected:{glasses:true},prepared:{trained:true},assessmentSteps:[{id:'one',title:'Original assessment',items:[{hazard:'Original hazard',controls:'Original control'}]}],additions:[{location:'Site B',activity:'Service',hazards:'Later hazard',controls:'Later control',ppe:'Glasses',acknowledgedAtMs:1789387260000}],notes:'<script>unsafe</script>'};
const before=JSON.stringify(record);
for(const width of [undefined,3,4]){const html=jsaDocumentHtml(record,width);for(const text of ['Original assessment','Original hazard','Original control','Site B','Later control','Example Driver','fixture-only','Original signature','Added location / activity'])assert.ok(html.includes(text),text);assert.ok(html.includes('Site &lt;A&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('data:image/png;base64,aGVsbG8='));assert.ok(!html.includes('Reference only:'));assert.ok(html.includes(width?`size:${width}in 11in`:'size:letter'));}
assert.equal(JSON.stringify(record),before);
assert.ok(jsaDocumentHtml({...record,assessmentSteps:[]}).includes('not proof of what was originally read'));
assert.ok(!jsaDocumentHtml({...record,signatureImage:'javascript:alert(1)'}).includes('<img'));
assert.ok(jsaDocumentHtml({...record,signatureImage:''}).includes('Signature image unavailable in this saved record.'));
assert.ok(!jsaDocumentHtml(record).includes('Signature image unavailable'));
const taskAddition={...record.additions[0],taskAssessment:{templates:[{name:'Unloading',version:2}],steps:[{title:'Exact added task',items:[{hazard:'Added hazard',controls:'Added control <text>'}]}],ppeItems:[{label:'Special PPE'}],preparedItems:[{label:'Additional preparation'}]}};
for(const width of [undefined,3,4]){
 const report=jsaDocumentHtml({...record,additions:[taskAddition]},width);
 for(const text of ['Unloading','Version 2','Exact added task','Added control &lt;text&gt;','Special PPE','Additional preparation','Original signature'])assert.ok(report.includes(text),text);
}
assert.equal(signingTime(undefined),'Not recorded');assert.equal(signingTime('bad'),'Not recorded');
console.log('JSA documents: paper/3-inch/4-inch content, signature, additions, escaping, immutable projection and legacy reference passed.');
