import assert from 'node:assert/strict';
import { decideJsaCreationAccess } from '../services/jsaCreationAccess.ts';
const base = { authenticated: true, companyId: 'test-company', driverId: 'test-driver', companyJsaAllowed: true, requiredLaunchPresent: false, request: null };
assert.deepEqual(decideJsaCreationAccess(base), { kind: 'standalone', companyId: base.companyId, driverId: base.driverId, shiftId: null });
for (const patch of [{authenticated:false}, {driverId:null}, {companyId:null}, {companyJsaAllowed:false}]) {
  assert.equal(decideJsaCreationAccess({...base,...patch}).kind, 'denied');
}
const request = {requestId:'test-request',companyId:base.companyId,driverId:base.driverId,shiftId:'2026-09-13_080000',verified:true};
assert.equal(decideJsaCreationAccess({...base,request}).kind,'standalone');
assert.equal(decideJsaCreationAccess({...base,requiredLaunchPresent:true,request}).kind,'required');
for(const patch of [{verified:false},{companyId:'other'},{driverId:'other'},{shiftId:''},{requestId:''}]) {
  assert.equal(decideJsaCreationAccess({...base,requiredLaunchPresent:true,request:{...request,...patch}}).kind,'denied');
}
assert.equal(decideJsaCreationAccess({...base,requiredLaunchPresent:true}).kind,'denied');
console.log('13 standalone/required-access boundary cases passed.');
