const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const m={exports:{}};let session={uid:'u',generation:'g',driverId:'d',companyId:'c'},launch=null,calls=[];
const source=fs.readFileSync('services/standaloneJsa.ts','utf8');const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
new Function('require','module','exports',js)(name=>{
 if(name==='firebase/app')return{getApp:()=>({})};
 if(name==='firebase/functions')return{getFunctions:()=>({}),httpsCallable:()=>async body=>{calls.push(body);return{data:{allowed:true,companyId:'c',driverId:'d',record:{id:body.recordId}}};}};
 if(name==='expo-crypto')return{CryptoDigestAlgorithm:{SHA256:'sha256'},digestStringAsync:async(_,s)=>crypto.createHash('sha256').update(s).digest('hex')};
 if(name.endsWith('jsaGovernedAuthLive'))return{loadUsableGovernedSession:async()=>session};
 if(name.endsWith('jsaRuntime'))return{loadLaunchContext:async()=>launch};
 if(name.endsWith('jsaArtifactSnapshot'))return{adaptGovernedSnapshot:raw=>({ok:true,value:{signature:raw.signatureImage}})};
 throw Error(name);
},m,m.exports);
(async()=>{
 const api=m.exports,payload={id:'local-1',driverId:'d',companyId:'c',workflow:'standalone',jobActivityName:'Test',wells:[],signatureImage:'test'};
 assert.equal(await api.standaloneAccess(),true);
 await api.persistStandaloneJsa(payload);const first=calls.at(-1);
 assert.deepEqual(Object.keys(first).sort(),['job','operation','recordId','snapshot']);
 await api.persistStandaloneJsa(payload);assert.equal(calls.at(-1).recordId,first.recordId);
 launch={requestId:'required'};await assert.rejects(()=>api.persistStandaloneJsa(payload));assert.equal(await api.standaloneAccess(),false);
 launch=null;await assert.rejects(()=>api.persistStandaloneJsa({...payload,companyId:'other'}));
 session=null;await assert.rejects(()=>api.standaloneCall({operation:'access'}));
 console.log('7 client boundary checks passed: stable retries, no client identity/shift fields, required launch and owner mismatch refused.');
})().catch(e=>{console.error(e);process.exitCode=1});
