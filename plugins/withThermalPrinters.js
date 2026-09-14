const { withDangerousMod, withAppBuildGradle, withMainApplication, withAndroidManifest } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');
module.exports = function withThermalPrinters(config) {
  config = withAndroidManifest(config, c => {
    const manifest = c.modResults.manifest;
    const permissions = manifest['uses-permission'] ||= [];
    for (const name of ['BLUETOOTH', 'BLUETOOTH_ADMIN', 'BLUETOOTH_CONNECT', 'BLUETOOTH_SCAN']) {
      if (!permissions.some(p => p.$['android:name'] === `android.permission.${name}`))
        permissions.push({ $: { 'android:name': `android.permission.${name}`, ...(name === 'BLUETOOTH_SCAN' ? {'android:usesPermissionFlags':'neverForLocation'} : {}) } });
    }
    return c;
  });
  config = withDangerousMod(config, ['android', async c => {
    const root = c.modRequest.platformProjectRoot;
    const dest = path.join(root, 'app/src/main/java/com/syconik801/jsaapp');
    fs.mkdirSync(dest, {recursive:true});
    for (const file of fs.readdirSync(path.join(__dirname,'thermal/android')))
      fs.copyFileSync(path.join(__dirname,'thermal/android',file),path.join(dest,file));
    fs.mkdirSync(path.join(root,'app/libs'),{recursive:true});
    fs.copyFileSync(path.join(__dirname,'thermal/libs/BrotherPrintLibrary.aar'),path.join(root,'app/libs/BrotherPrintLibrary.aar'));
    return c;
  }]);
  config = withAppBuildGradle(config, c => {
    if (!c.modResults.contents.includes('libs/BrotherPrintLibrary.aar'))
      c.modResults.contents = c.modResults.contents.replace(/dependencies\s*\{/, 'dependencies {\n    implementation(files("libs/BrotherPrintLibrary.aar"))');
    return c;
  });
  return withMainApplication(config, c => {
    if (!c.modResults.contents.includes('add(BrotherPrinterPackage())')) {
      const marker = 'PackageList(this).packages.apply {';
      if (!c.modResults.contents.includes(marker)) throw new Error('Thermal printer registration: MainApplication marker missing');
      c.modResults.contents = c.modResults.contents.replace(marker, `${marker}\n              add(BrotherPrinterPackage())\n              add(EscPosPrinterPackage())`);
    }
    return c;
  });
};
