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
console.log('Preparation submission: all 16 switch combinations, missing/custom answers, strict booleans and screen guards passed.');
