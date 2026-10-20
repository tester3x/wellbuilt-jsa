import {getFunctions,httpsCallable} from 'firebase/functions';
import {app} from './firebase';
import {awaitGovernedAuthReady,getGovernedAuth,persistAfterExchange} from './sso/jsaGovernedAuthLive';
import {loadGovernedSession,installationFinalizedFor} from './sso/jsaRuntime';
import {parseManualLoginPayload} from './sso/jsaManualLogin';
import {createDeviceAccountClient,type DeviceAccountNative} from './deviceAccount.generated';
const native=require('../modules/wellbuilt-platform') as DeviceAccountNative|null;
export const jsaDeviceAccount=createDeviceAccountClient(native,async(name,data)=>(await httpsCallable(getFunctions(app,'us-central1'),name,{timeout:15000})(data)).data);
export async function restoreJsaDeviceAccount(){
 await awaitGovernedAuthReady();const capturedUser=getGovernedAuth().currentUser;const saved=await loadGovernedSession(),uid=getGovernedAuth().currentUser?.uid;
 const finalized=saved?await installationFinalizedFor({status:'finalized',generation:saved.generation,uid:saved.uid,driverId:saved.driverId,companyId:saved.companyId}):false;
 if(getGovernedAuth().currentUser!==capturedUser)throw Object.assign(Error('Account changed during local restore.'),{code:'platform/superseded'});
 return jsaDeviceAccount.restore('jsa',saved&&uid===saved.uid&&finalized?saved:null,async reply=>{
  const payload=parseManualLoginPayload({protocolVersion:1,customToken:reply.customToken,...reply.access.owner,displayName:reply.access.profile.displayName||undefined,legalName:reply.access.profile.legalName||undefined,jsaBinding:reply.jsaBinding});
  if(!payload.ok)throw Error('platform_binding_mismatch');
  await persistAfterExchange(payload.payload);
 });
}
export async function publishJsaDeviceAccount(explicit=false){
 const user=getGovernedAuth().currentUser;if(!user)return;
 const {claims}=await user.getIdTokenResult(false);if(claims.kind!=='driver'||typeof claims.driverId!=='string'||typeof claims.companyId!=='string')return;
 const local=await loadGovernedSession();if(local?.uid!==user.uid||local?.driverId!==claims.driverId||local?.companyId!==claims.companyId)return;
 await jsaDeviceAccount.publish({uid:user.uid,driverId:claims.driverId,companyId:claims.companyId},()=>getGovernedAuth().currentUser===user,explicit);
}

export async function revokeJsaDeviceAccount(){const saved=await jsaDeviceAccount.read();if(saved&&getGovernedAuth().currentUser?.uid===saved.access.owner.uid)await jsaDeviceAccount.revoke(saved.access.owner);}
