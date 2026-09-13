import assert from 'node:assert/strict';
import { callbackMayOpenApp } from '../services/sso/jsaCallbackDestination.ts';
import { handleJsaSsoCallbackUrl, resetJsaCallbackOwnerForTests } from '../services/sso/jsaCallbackOwner.ts';
import { consumeCallback, parseJsaSsoCallbackUrl, markConsumed } from '../services/sso/jsaPkce.ts';

let passed=0;
for (const kind of ['exchanged','duplicate','fail_closed','ignored']) {
 for (const purpose of [undefined,'app_access']) for (const hasLaunch of [false,true]) for (const usable of [false,true]) {
   assert.equal(callbackMayOpenApp({kind,purpose},hasLaunch,usable),
     ['exchanged','duplicate'].includes(kind) && purpose==='app_access' && !hasLaunch && usable);
   passed++;
 }
}
for (const purpose of [undefined,'app_access']) {
 resetJsaCallbackOwnerForTests();
 let attempt={state:'s'.repeat(43),verifier:'v'.repeat(43),createdAtMs:1,consumed:false,purpose};
 let stored=null, exchanges=0;
 const deps={nowMs:()=>10,parseUrl:parseJsaSsoCallbackUrl,loadAttempt:async()=>attempt,
   consume:consumeCallback,markConsumed,saveAttempt:async a=>{attempt=a},clearAttempt:async()=>{attempt=null},
   exchange:async()=>{exchanges++;return {uid:'sample',driverId:'driver',companyId:'company'}},
   saveSession:async s=>{stored=s},loadSession:async()=>stored,obtainAfterSession:async()=>{}};
 const url=`jsaapp://sso-callback?v=1&status=success&code=${'c'.repeat(43)}&state=${'s'.repeat(43)}`;
 const [a,b]=await Promise.all([handleJsaSsoCallbackUrl(url,deps),handleJsaSsoCallbackUrl(url,deps)]);
 assert.equal(a.kind,'exchanged');assert.equal(a.purpose,purpose);assert.deepEqual(a,b);assert.equal(exchanges,1);passed++;
}
console.log(`RESULT passed=${passed} failed=0`);
