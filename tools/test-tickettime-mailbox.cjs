// Executes the actual native mailbox on the JVM; no APK or Android runtime needed.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),cache=path.join(os.homedir(),'.gradle/caches/modules-2/files-2.1');
function jar(group,name){const dir=path.join(cache,group,name);function walk(p){for(const f of fs.readdirSync(p,{withFileTypes:true}).sort((a,b)=>b.name.localeCompare(a.name,undefined,{numeric:true}))){const full=path.join(p,f.name);if(f.isDirectory()){const result=walk(full);if(result)return result;}else if(f.name.endsWith('.jar')&&!f.name.includes('-sources')&&!f.name.includes('-javadoc'))return full;}}return walk(dir);}
const libraries=[['org.jetbrains.kotlin','kotlin-compiler-embeddable'],['org.jetbrains.kotlin','kotlin-stdlib'],['org.jetbrains.kotlin','kotlin-script-runtime'],['org.jetbrains.kotlin','kotlin-reflect'],['org.jetbrains.kotlin','kotlin-daemon-embeddable'],['org.jetbrains.intellij.deps','trove4j'],['org.jetbrains.kotlinx','kotlinx-coroutines-core-jvm'],['org.jetbrains','annotations']].map(([g,n])=>jar(g,n));
const json=jar('org.json','json'),stdlib=jar('org.jetbrains.kotlin','kotlin-stdlib');
const baseline=process.argv.find(a=>a.startsWith('--baseline='));
const source=baseline?spawnSync('git',['show',baseline.slice('--baseline='.length)+':plugins/work-forms/JsaWorkForms.kt'],{cwd:root,encoding:'utf8'}).stdout:fs.readFileSync(path.join(root,'plugins/work-forms/JsaWorkForms.kt'),'utf8');
const mailbox=source.slice(source.indexOf('object JsaFormsMemory {'),source.indexOf('class JsaWorkFormsModule'));
if(!mailbox.includes('fun publish'))throw Error('Native mailbox not found');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'jsa-mailbox-'));
fs.writeFileSync(path.join(temp,'Uri.kt'),`package android.net
class Uri(val authority:String,val path:String,val queryParameterNames:Set<String>,val params:Map<String,String>){fun getQueryParameter(key:String)=params[key]}`);
fs.writeFileSync(path.join(temp,'Main.kt'),`import android.net.Uri
import org.json.JSONObject
${mailbox}
fun main(){
 val uri=Uri("com.syconik801.jsaapp.workforms","/forms",setOf("startDate","endDate"),mapOf("startDate" to "2026-10-12","endDate" to "2026-10-18"))
 val payload="""{"schema":"wellbuilt.work-forms","schemaVersion":1,"startDate":"2026-10-12","endDate":"2026-10-18"}"""
 val revision=JsaFormsMemory.clear()
 repeat(100){check(JsaFormsMemory.read(uri)==null)}
 check(JsaFormsMemory.publish(revision,System.currentTimeMillis()+10000,payload)){"Polling invalidated the pending writer"}
 check(String(JsaFormsMemory.read(uri)!!)==payload)
 JsaFormsMemory.clear()
 check(!JsaFormsMemory.publish(revision,System.currentTimeMillis()+10000,payload)){"Old account/request published after clear"}
 val fresh=JsaFormsMemory.clear()
 ${mailbox.includes('fun clearIfCurrent')?'check(!JsaFormsMemory.clearIfCurrent(revision)){"Older failure invalidated newer publisher"}':''}
 check(JsaFormsMemory.publish(fresh,System.currentTimeMillis()+30,payload))
 Thread.sleep(50);check(JsaFormsMemory.read(uri)==null)
 check(!JsaFormsMemory.publish(fresh,System.currentTimeMillis()+10000,payload)){"Expired writer reused"}
 println("Native JSA mailbox: pending polls, publication, invalidation and expiry passed")
}`);
function run(args){const r=spawnSync('java',args,{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stdout+r.stderr);process.exit(r.status||1);}process.stdout.write(r.stdout);}
run(['-cp',libraries.join(path.delimiter),'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler','-no-stdlib','-no-reflect','-classpath',[stdlib,json].join(path.delimiter),'-d',path.join(temp,'classes'),path.join(temp,'Main.kt'),path.join(temp,'Uri.kt')]);
run(['-cp',[path.join(temp,'classes'),stdlib,json].join(path.delimiter),'MainKt']);
