import {getFunctions,httpsCallable} from 'firebase/functions';
import {app} from './firebase';
import {getGovernedAuth} from './sso/jsaGovernedAuthLive';
export const preparedShiftJsa=require('../modules/wellbuilt-platform/preparedJsa').createNativePreparedJsa({
 user:()=>getGovernedAuth().currentUser,
 call:async(body:unknown)=>(await httpsCallable(getFunctions(app),'jsaOfflineShift',{timeout:15000})(body)).data,
});
