import {getFunctions,httpsCallable} from 'firebase/functions';
import {app} from './firebase';
import {getGovernedAuth,awaitGovernedAuthReady} from './sso/jsaGovernedAuthLive';
export const preparedShiftJsa=require('../modules/wellbuilt-platform/preparedJsa').createNativePreparedJsa({
 ready:awaitGovernedAuthReady,
 user:()=>getGovernedAuth().currentUser,
 call:async(body:unknown)=>(await httpsCallable(getFunctions(app),'jsaOfflineShift',{timeout:15000})(body)).data,
});
