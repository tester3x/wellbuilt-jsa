const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('native audit uses pure production client core, native persistence and demo-only SDK endpoints',()=>{
 const entry=fs.readFileSync('tools/native-audit/index.tsx','utf8'),runtime=fs.readFileSync('services/legacyEvidence.ts','utf8'),core=fs.readFileSync('services/legacyEvidenceCore.ts','utf8');
 assert.match(entry,/services\/legacyEvidenceCore/);assert.match(runtime,/createLegacyEvidenceClient/);
 assert.match(entry,/getReactNativePersistence\(AsyncStorage\)/);assert.match(entry,/HermesInternal/);assert.match(entry,/connectFunctionsEmulator/);assert.match(entry,/connectAuthEmulator/);
 assert.ok(!/\.\/firebase|jsaGovernedAuthLive|wellbuilt-sync/.test(core));assert.ok(!/wellbuilt-sync|services\/firebase|jsaGovernedAuthLive|expo-router/.test(entry));
});
test('separate signed variant cannot replace or launch production apps or claim existing URI authorities',()=>{
 const g=fs.readFileSync('tools/native-audit/audit.gradle','utf8'),m=fs.readFileSync('tools/native-audit/AndroidManifest.xml','utf8'),b=fs.readFileSync('tools/native-audit/build.cjs','utf8');
 assert.match(g,/applicationId 'com\.syconik801\.jsaapp\.audit'/);assert.match(g,/WB_NATIVE_AUDIT/);assert.match(g,/wbRegisteredRelease/);
 assert.ok(!/jsaapp"\/|android:authorities=|android:scheme=/.test(m));assert.match(m,/allowBackup="false"/);
 assert.match(b,/COPYFILE_EXCL/);assert.match(b,/finally\{fs.writeFileSync\(gradle,original\)/);assert.ok(!/adb.*(?:clear|uninstall)|firebase deploy/.test(b));
});
