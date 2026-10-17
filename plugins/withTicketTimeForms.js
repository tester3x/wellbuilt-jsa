const {withAndroidManifest,withDangerousMod,withMainApplication}=require('expo/config-plugins');
const fs=require('fs'),path=require('path');
module.exports=config=>{
 config=withAndroidManifest(config,c=>{
  const manifest=c.modResults.manifest,app=manifest.application[0];
  const permissions=manifest['uses-permission']||=[];
  for(const name of ['FOREGROUND_SERVICE','WAKE_LOCK'])if(!permissions.some(p=>p.$['android:name']==='android.permission.'+name))permissions.push({$:{'android:name':'android.permission.'+name}});
  const providers=app.provider||=[];
  if(!providers.some(p=>p.$['android:name']==='com.syconik801.jsaapp.JsaWorkFormsProvider'))providers.push({$:{'android:name':'com.syconik801.jsaapp.JsaWorkFormsProvider','android:authorities':'com.syconik801.jsaapp.workforms','android:exported':'true','android:grantUriPermissions':'false'}});
  const services=app.service||=[];
  if(!services.some(p=>p.$['android:name']==='com.syconik801.jsaapp.JsaWorkFormsService'))services.push({$:{'android:name':'com.syconik801.jsaapp.JsaWorkFormsService','android:exported':'false','android:foregroundServiceType':'shortService'}});
  const queries=manifest.queries||=[];if(!queries.some(q=>q.package?.some(p=>p.$['android:name']==='com.michaelburger.tickettime')))queries.push({package:[{$:{'android:name':'com.michaelburger.tickettime'}}]});
  return c;
 });
 config=withDangerousMod(config,['android',async c=>{const dest=path.join(c.modRequest.platformProjectRoot,'app/src/main/java/com/syconik801/jsaapp');fs.mkdirSync(dest,{recursive:true});fs.copyFileSync(path.join(__dirname,'work-forms/JsaWorkForms.kt'),path.join(dest,'JsaWorkForms.kt'));return c;}]);
 return withMainApplication(config,c=>{const marker='PackageList(this).packages.apply {';if(!c.modResults.contents.includes('add(JsaWorkFormsPackage())')){if(!c.modResults.contents.includes(marker))throw new Error('JSA work forms registration missing');c.modResults.contents=c.modResults.contents.replace(marker,marker+'\n              add(JsaWorkFormsPackage())');}return c;});
};
