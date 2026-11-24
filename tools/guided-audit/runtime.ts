// Isolated acceptance adapter: never imported by a production entry point.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {initializeApp} from 'firebase/app';
import {initializeAuth,connectAuthEmulator,signInWithCustomToken} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {applicationId} from 'expo-application';
export const role=applicationId==='com.syconik801.jsaapp.audit.tickets'?'wbt':'jsa';
if(!['com.syconik801.jsaapp.audit','com.syconik801.jsaapp.audit.tickets'].includes(applicationId!))throw Error('Audit package required');
export const BASE='http://127.0.0.1:8789';
const originalFetch=globalThis.fetch;
globalThis.fetch=((input:any,init:any)=>{
 const url=typeof input==='string'?input:input.url;
 if(!require('./networkPolicy.cjs').allowed(url))throw Error('Audit blocked non-emulator network');
 return originalFetch(input,init);
}) as typeof fetch;
export const app=initializeApp({projectId:'demo-wb-audit-s24',apiKey:'synthetic-emulator-key',appId:'guided-audit'},'guided-audit');
const rn=require('firebase/auth');
export const auth=initializeAuth(app,{persistence:rn.getReactNativePersistence(AsyncStorage)});
connectAuthEmulator(auth,'http://127.0.0.1:9299',{disableWarnings:true});
const functions=getFunctions(app);connectFunctionsEmulator(functions,'127.0.0.1',5001);
export const call=async(name:string,body:any)=>(await httpsCallable(functions,name,{timeout:10000})(body)).data as any;
export let boot:any;
export async function ready(){
 await auth.authStateReady();boot=await fetch(BASE+'/bootstrap').then(r=>r.json());
 if(boot.projectId!=='demo-wb-audit-s24')throw Error('Wrong fixture');
 await signInWithCustomToken(auth,boot.identities.a[role].customToken);
}
export async function owner(){const user=auth.currentUser;if(!user)return null;const {claims}=await user.getIdTokenResult();return {uid:user.uid,companyId:claims.companyId,driverId:claims.driverId,generation:1};}
