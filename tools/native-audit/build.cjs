// Local isolated test-variant runner; does not replace the production release runner.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),plan=JSON.parse(fs.readFileSync(process.argv[2]||''));
function run(exe,args,opt={}){const r=cp.spawnSync(exe,args,{cwd:root,encoding:'utf8',windowsHide:true,...opt});if(r.status!==0)throw Error(`${path.basename(exe)} failed: ${r.status} ${opt.stdio==='inherit'?'':r.stderr||''}`);return (r.stdout||'').trim();}
const git=(...a)=>run('git',a),need=(v,m)=>{if(!v)throw Error(m);};
need(['com.syconik801.jsaapp.audit','com.syconik801.jsaapp.audit.tickets'].includes(plan.package)&&plan.project==='demo-wb-audit-s24','Test-only identity required');
need(plan.package!=='com.syconik801.jsaapp.audit.tickets'||plan.mode==='guided'&&plan.role==='wbt','Companion must be isolated guided caller');
if(plan.mode==='guided'){
 need(['wbt','jsa'].includes(plan.role),'Guided role required');
 const t=plan.ticketsSource;need(t?.home==='C:/dev/TicketTimeExpo/tmp/wbt-jobtype-regression','Registered Tickets source required');
 need(run('git',['rev-parse','HEAD'],{cwd:t.home})===t.commit&&!run('git',['status','--porcelain'],{cwd:t.home}),'Tickets source moved or dirty');
 run('git',['fetch','origin'],{cwd:t.home});need(run('git',['rev-parse','@{upstream}'],{cwd:t.home})===t.commit,'Tickets source not synchronized');
}
need(plan.owner===process.env.CODEX_SESSION_ID,'Actual session owner required');
run(process.execPath,['C:/dev/workspace-control/guard.cjs','check',root]);
git('fetch','origin','+refs/heads/*:refs/remotes/origin/*','--tags');
const head=git('rev-parse','HEAD'),branch=git('branch','--show-current');
need(head===plan.sourceCommit&&!git('status','--porcelain'),'Exact committed clean source required');
need(git('remote','get-url','origin')==='https://github.com/tester3x/wellbuilt-jsa.git','Registered source only');
const heads=Object.fromEntries(git('ls-remote','--heads','origin').split('\n').map(r=>{const [sha,ref]=r.split(/\s+/);return [ref.slice(11),sha];}));
need(heads[branch]===head&&Object.keys(heads).length===Object.keys(plan.reviewedHeads).length,'Pushed reviewed source required');
for(const [b,sha] of Object.entries(heads))need(plan.reviewedHeads[b]?.commit===sha&&plan.reviewedHeads[b]?.reason,'Remote movement/unreviewed branch '+b);
for(const sha of plan.expectedCommits)git('merge-base','--is-ancestor',sha,head);
const prefix=plan.role==='wbt'?'android-native-audit-tickets-v':'android-native-audit-v';
const tag=prefix+plan.versionCode,remote=git('ls-remote','--tags','origin','refs/tags/'+prefix+'*');
need(remote.includes(head+'\trefs/tags/'+tag+'^{}'),'Immutable audit reservation missing');
const reserve=JSON.parse(git('for-each-ref','--format=%(contents)','refs/tags/'+tag));
need(reserve.sourceCommit===head&&reserve.package===plan.package&&reserve.owner===plan.owner,'Reservation mismatch');
need(!remote.split('\n').some(r=>Number(r.match(/native-audit-(?:tickets-)?v(\d+)/)?.[1]||0)>plan.versionCode),'Newer audit version exists');
const credentialsFile='C:/dev/local-secrets/android/com.syconik801.jsaapp/credentials.json';
const key=JSON.parse(fs.readFileSync(credentialsFile)).android.keystore,keyFile=path.resolve(path.dirname(credentialsFile),key.keystorePath);
const javaHome='C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot',sdk='C:/dev/tools/android-sdk';
const env={...process.env,JAVA_HOME:javaHome,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,WB_NATIVE_AUDIT:'1',WB_NATIVE_AUDIT_VERSION:String(plan.versionCode),WB_LOCAL_CREDENTIALS:credentialsFile,WB_LOCAL_KEYSTORE:keyFile,WB_RELEASE_VERSION_CODE:'122',NODE_ENV:'production',CI:'1'};
env.WB_GUIDED_AUDIT=plan.mode==='guided'?'1':'0';env.WB_GUIDED_ROLE=plan.role||'jsa';
env.PATH=javaHome+'/bin;'+sdk+'/platform-tools;'+process.env.PATH;
function identity(apk){const b=run(sdk+'/build-tools/36.0.0/aapt.exe',['dump','badging',apk],{env}),c=run(javaHome+'/bin/java.exe',['-jar',sdk+'/build-tools/36.0.0/lib/apksigner.jar','verify','--print-certs',apk],{env});return {package:b.match(/package: name='([^']+)'/)?.[1],versionCode:Number(b.match(/versionCode='(\d+)'/)?.[1]),signer:c.match(/Signer #1 certificate SHA-256 digest: ([a-f0-9]+)/)?.[1]};}
const baseline=identity(plan.baselineApk);need(baseline.package==='com.syconik801.jsaapp'&&baseline.versionCode===122&&baseline.signer===plan.signingSha256,'Approved production signer required');
const gradle=path.join(root,'android/app/build.gradle'),original=fs.readFileSync(gradle),output=path.resolve(plan.output);
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'native-gradle-before.txt'),original);
try{
 need(!original.toString().includes('native-audit/audit.gradle'),'Native Gradle already has an audit override');
 fs.appendFileSync(gradle,"\napply from: rootProject.file('../tools/native-audit/audit.gradle')\n");
 run('gradlew.bat',[':app:createBundleReleaseJsAndAssets','--rerun-tasks','--no-daemon','-PreactNativeArchitectures=arm64-v8a'],{cwd:path.join(root,'android'),env,shell:true,stdio:'inherit'});
 need(git('rev-parse','HEAD')===head&&!git('status','--porcelain'),'Source changed during bundle');
 run('gradlew.bat',[':app:assembleRelease','-PreactNativeArchitectures=arm64-v8a','--max-workers=2','--no-daemon'],{cwd:path.join(root,'android'),env,shell:true,stdio:'inherit'});
 const built=path.join(root,'android/app/build/outputs/apk/release/app-release.apk'),id=identity(built);
 need(id.package===plan.package&&id.versionCode===plan.versionCode&&id.signer===plan.signingSha256,'Audit APK identity/signature mismatch');
 const apk=path.join(output,plan.package+'-v'+plan.versionCode+'.apk');fs.copyFileSync(built,apk,fs.constants.COPYFILE_EXCL);
 const receipt={...plan,...id,artifact:apk,sha256:crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),builtAt:new Date().toISOString(),method:'Registered-home local Gradle isolated native test variant; no production APK replacement, cloud build or deploy'};
 fs.writeFileSync(path.join(output,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log('Native audit APK verified: '+apk);
}finally{fs.writeFileSync(gradle,original);}
need(!git('status','--porcelain')&&git('rev-parse','HEAD')===head,'Source changed; hold artifact');
