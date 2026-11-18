const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
const vm = require('node:vm');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/jsaPreparation.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exported });
const items = ['ready', 'trained', 'toolsAndPpe', 'sds'].map(id => ({ id }));
for (let mask = 0; mask < 16; mask++) {
  const answers = Object.fromEntries(items.map((item, i) => [item.id, !!(mask & (1 << i))]));
  assert.equal(exported.allPreparationConfirmed(items, answers), mask === 15, `combination ${mask}`);
}
assert.equal(exported.allPreparationConfirmed(items, {}), false);
assert.equal(exported.allPreparationConfirmed([{ id: 'company-specific' }], { trained: true }), false);
assert.equal(exported.allPreparationConfirmed([{ id: 'company-specific' }], { 'company-specific': true }), true);
assert.equal(exported.allPreparationConfirmed(items, { ready: 'true', trained: true, toolsAndPpe: true, sds: true }), false);
const screen = fs.readFileSync('app/signoff.tsx', 'utf8');
assert.match(screen, /const preparationConfirmed = allPreparationConfirmed\(preparedItemsList, prepared\)/);
assert.match(screen, /if \(!preparationConfirmed\)\s*\{[\s\S]*?setValidationNotice[\s\S]*?return;/);
assert.match(screen, /disabled=\{submitting \|\| !preparationConfirmed\}/);
const configured = [
  {id:'ready',label:'I am prepared for work'},
  {id:'trained',label:'I am properly trained for the job'},
  {id:'toolsAndPpe',label:'I have the tools & PPE needed for work'},
  {id:'sds',label:'SDS'},
];
assert.equal(exported.preparationChecks(configured).map(x=>x.id).join(','),'trained,toolsAndPpe,sds');
for(let mask=0;mask<8;mask++){
  const selected={ready:true,trained:!!(mask&1),toolsAndPpe:!!(mask&2),sds:!!(mask&4)};
  const before=JSON.stringify(selected),projected=exported.preparationAnswers(configured,selected);
  assert.equal(projected.ready,mask===7,'title cannot bypass an unchecked preparation item');
  assert.equal(exported.allPreparationConfirmed(configured,projected),mask===7);
  assert.equal(JSON.stringify(selected),before,'existing answers are not mutated');
}
assert.equal(exported.preparationChecks([{id:'ready',label:'Check radio readiness'}]).length,1,'IDs alone never hide custom checks');
assert.equal(exported.preparationChecks(configured.slice(1)).length,3,'built-in checklist is unchanged');
assert.match(screen,/preparationChecks\(preparedItemsList\)\.map/);
console.log('Preparation submission: all 16 original combinations, 8 heading projections, custom checks, strict booleans, immutable answers and screen guards passed.');
