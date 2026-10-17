const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/jsaHistoryNotice.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(mod, mod.exports);
const notice = mod.exports.jsaHistoryNotice;
assert.equal(notice('checking', false), 'checking');
assert.equal(notice('backend_required', true), 'checking', 'prior-history verdict must not masquerade as failure of an opening job request');
assert.equal(notice('unavailable', true), 'checking');
assert.equal(notice('found', false), null);
assert.equal(notice('backend_required', false), 'backend_required');
assert.equal(notice('unavailable', false), 'unavailable', 'real failures still expose retry');
console.log('PASS pending read presentation, verification-in-progress, successful history and actual error states');
