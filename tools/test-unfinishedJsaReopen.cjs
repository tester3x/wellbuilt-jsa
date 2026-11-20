const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function routeFixture(){const f={context:{requestId:'r'.repeat(43),state:'pending',intent:'read_and_acknowledge'},launch:{requestId:'r'.repeat(43)},saved:[]};const e={};new Function('exports','require',compile(fs.readFileSync('services/sso/jsaGovernedRoute.ts','utf8')))(e,n=>n==='./jsaRuntime'?{loadRequestContext:async()=>f.context,loadLaunchContext:async()=>f.launch,saveGovernedUiStage:async s=>f.saved.push(s)}:{});f.route=e.resolveEntryRoute;return f;}
test('verified pending read returns exact request to original populated Steps entry on every reopen',async()=>{const f=routeFixture();const d={kind:'ready',next:'resume_ui',ui:'read_and_acknowledge'};const before=JSON.stringify(f.context);
 for(let i=0;i<3;i++)assert.deepEqual(await f.route(d,{}),{pathname:'/(tabs)',params:{welcomeReadRequestId:f.context.requestId}});
 assert.equal(JSON.stringify(f.context),before);assert.equal(f.saved.length,3);
});
test('mismatched, missing or completed context cannot open another jobs read; ack keeps its own route',async()=>{const f=routeFixture(),d={kind:'ready',next:'resume_ui',ui:'read_and_acknowledge'};
 f.launch={requestId:'other'};assert.equal((await f.route(d,{})).params.refusal,'binding_mismatch');
 f.launch={requestId:f.context.requestId};f.context.state='completed';assert.equal((await f.route(d,{})).pathname,'/governed-status');
 assert.equal(await f.route({...d,ui:'acknowledge_only'},{}),'/acknowledge');
});
test('stale initial intent refuses without clearing current live owner or request-scoped answers',async()=>{
 const source=fs.readFileSync('services/sso/jsaStartLive.ts','utf8');const start=source.indexOf('async function initialCandidateAllowed('),end=source.indexOf('\nexport {',start);assert(start>=0&&end>start);
 const disk=new Map([['@jsa/installationSeen','1'],['saved-answers','kept']]);let cleared=false;const e={};
 new Function('exports','require','AsyncStorage','parseJsaLaunchUrl','loadLaunchOwnership','initialStartMayOwn','INSTALLATION_SEEN_KEY','IGNORED_INITIAL_REQUEST_KEY',compile(source.slice(start,end)+'\nexports.run=initialCandidateAllowed;'))(e,()=>({clearLocalGovernedLaunchState:async()=>cleared=true}),{getItem:async k=>disk.get(k)||null,setItem:async(k,v)=>disk.set(k,v)},()=>({ok:true,value:{requestId:'request'}}),async()=>({request:{requestId:'request'},receivedAtMs:1}),()=>false,'@jsa/installationSeen','@jsa/ignoredInitialRequestId');
 assert.equal(await e.run('url'),false);assert.equal(cleared,false);assert.equal(disk.get('saved-answers'),'kept');
 const landing=fs.readFileSync('app/start.tsx','utf8');assert(!landing.includes("router.replace('/login')"));
});
