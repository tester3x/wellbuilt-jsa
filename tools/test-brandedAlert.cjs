const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const moduleValue = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/brandedAlert.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: moduleValue.exports });
const { BrandedAlert, subscribeBrandedAlert, dismissBrandedAlert } = moduleValue.exports;
let shown, retries = 0;
BrandedAlert.alert('Completion not recorded', 'Saved locally', [{ text: 'Retry', onPress: () => retries++ }]);
const unsubscribe = subscribeBrandedAlert(value => { shown = value; });
assert.equal(shown.title, 'Completion not recorded');
BrandedAlert.alert('Second');
assert.equal(shown.title, 'Completion not recorded');
const retry = shown.buttons[0].onPress;
dismissBrandedAlert(); retry();
assert.equal(retries, 1);
assert.equal(shown.title, 'Second');
assert.equal(shown.buttons[0].text, 'OK');
dismissBrandedAlert(); assert.equal(shown, null);
unsubscribe();
for (const dir of ['app', 'components']) {
  for (const path of fs.readdirSync(dir, { recursive: true }).filter(p => /\.tsx?$/.test(p))) {
    const source = fs.readFileSync(`${dir}/${path}`, 'utf8');
    if (source.includes('Alert.alert(')) assert.ok(source.includes('BrandedAlert as Alert'), path);
    assert.ok(!/const\s*\{\s*Alert\s*\}\s*=\s*require\(['"]react-native/.test(source), path);
  }
}
console.log('PASS branded alert queue, preserved Retry callback, default action, and alert migration audit');
