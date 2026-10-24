const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');const ts=require('typescript');
function load(file,imports){const out={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 new Function('require','exports',js)(n=>{if(n in imports)return imports[n];throw Error(n);},out);return out;}
const contract=load('services/sso/jsaIdentityContract.ts',{}),policy=load('services/platformRuntime.generated.ts',{});
function fixture(){const f={owner:{uid:'u',companyId:'c',driverId:'d',generation:'g'},error:null,disk:new Map()};
 f.profile={driverId:'d',companyId:'c',legalName:'Test Legal',displayName:'Test Display',signature:'saved-image',assignedCustomers:[],truckNumber:'T'};
 f.api=load('services/driverAuth.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>f.disk.get(k)||null,setItem:async(k,v)=>f.disk.set(k,v)},'expo-secure-store':{},'./jsaRegistrationContract':{},'./platformRuntime.generated':policy,
 './sso/jsaRuntime':{loadGovernedSession:async()=>f.owner},'./sso/jsaCanonicalProfile':{fetchCanonicalGovernedProfile:async()=>{if(f.error)throw f.error;return f.profile;}},'./sso/jsaIdentityContract':contract});return f;}
test('saved legal name and signature remain available on transport failure',async()=>{const f=fixture();await f.api.fetchDriverProfile();f.error={code:'functions/unavailable'};const p=await f.api.fetchDriverProfile();assert.equal(p.legalName,'Test Legal');assert.equal(p.signature,'saved-image');});
test('access refusal never falls back to saved profile',async()=>{const f=fixture();await f.api.fetchDriverProfile();f.error={code:'functions/permission-denied'};await assert.rejects(f.api.fetchDriverProfile());});
test('another installation generation or driver cannot reuse the cached signature',async()=>{const f=fixture();await f.api.fetchDriverProfile();f.error={code:'functions/unavailable'};for(const next of [{...f.owner,generation:'new'},{...f.owner,driverId:'other'},null]){f.owner=next;assert.equal(await f.api.fetchDriverProfile(),null);}});

