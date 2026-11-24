// Native-only acceptance surface. No production app/config/session imports.
import React,{useEffect,useState} from 'react';
import {ScrollView,Text,Pressable,View} from 'react-native';
import {registerRootComponent} from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {initializeApp} from 'firebase/app';
import {initializeAuth,connectAuthEmulator,signInWithCustomToken} from 'firebase/auth';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {createLegacyEvidenceClient} from '../../services/legacyEvidenceCore';

const PROJECT='demo-wb-audit-s24',BASE='http://127.0.0.1:8789',KEY='@nativeAudit/work-v1';
const app=initializeApp({projectId:PROJECT,apiKey:'synthetic-emulator-key',appId:'synthetic-native-audit'},'native-audit-only');
const rn=require('firebase/auth');
if(typeof rn.getReactNativePersistence!=='function')throw Error('Native auth persistence unavailable');
const auth=initializeAuth(app,{persistence:rn.getReactNativePersistence(AsyncStorage)});
connectAuthEmulator(auth,'http://127.0.0.1:9299',{disableWarnings:true});
const functions=getFunctions(app);connectFunctionsEmulator(functions,'127.0.0.1',5001);
let work:any,generation=1,loseReceipt=false,switchAfter=false,transportCalls=0;
const lines:string[]=[];
let render=()=>{};
const log=(s:string)=>{lines.push(s);console.log('[NATIVE_AUDIT]',s);render();};
const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);log('PASS '+label);};
const save=()=>AsyncStorage.setItem(KEY,JSON.stringify(work));
const select=async(company:'a'|'b')=>{await signInWithCustomToken(auth,work.boot.identities[company].jsa.customToken);generation++;};
const client=createLegacyEvidenceClient({
 session:async()=>{const user=auth.currentUser;if(!user)return null;const {claims}=await user.getIdTokenResult();if(auth.currentUser!==user||claims.kind!=='driver'||claims.app!=='jsa'||typeof claims.companyId!=='string'||typeof claims.driverId!=='string')throw Error('test_owner_unresolved');return {uid:user.uid,companyId:claims.companyId,driverId:claims.driverId,generation};},
 call:async body=>{
  transportCalls++;
  const result=(await httpsCallable(functions,'jsaLegacyEvidence',{timeout:2500})(body)).data;
  if(loseReceipt&&body.operation==='receipt'){loseReceipt=false;throw Error('Injected lost receipt response after server commit');}
  if(switchAfter){switchAfter=false;await select('b');}
  return result;
 },
});
async function refused(fn:()=>Promise<unknown>,label:string){let no=false;try{await fn();}catch{no=true;}check(no,label);}
async function run(task:()=>Promise<void>){try{await task();}catch(e){log('FAIL '+(e instanceof Error?e.message:String(e)));work.lastFailure=lines.at(-1);await save();}}
async function initialize(){
 await auth.authStateReady();
 const saved=await AsyncStorage.getItem(KEY);
 if(saved){work=JSON.parse(saved);check(work.boot.projectId===PROJECT,'emulator project restored');check(JSON.stringify(work.record)===work.original,'native original survived process restart');check(work.pending===true,'pending work survived process restart');check(auth.currentUser?.uid===work.boot.identities.a.jsa.uid,'native persisted Auth restored company A');}
 else {
  const boot=await fetch(BASE+'/bootstrap').then(r=>r.json());if(boot.projectId!==PROJECT||!boot.run.startsWith('s24-'))throw Error('emulator fixture refused');
  work={boot,record:boot.record,original:JSON.stringify(boot.record),pending:true,stage:'ready'};await select('a');await save();
 }
 check(!!(globalThis as any).HermesInternal,'Hermes native runtime');
 log('READY '+work.stage);
 await SplashScreen.hideAsync();
}
async function offlineSave(){
 check(work.stage==='ready','fresh native offline phase');
 await save();
 await refused(()=>client.persistLegacyJsaEvidence(work.record),'unreachable emulator cannot confirm delivery');
 const disk=JSON.parse((await AsyncStorage.getItem(KEY))!);
 check(disk.original===work.original&&JSON.stringify(disk.record)===work.original,'signed original unchanged on native disk');
 check(disk.pending===true,'failed native delivery keeps pending work');
 work.stage='offline-saved';await save();log('OFFLINE SAVED — force-stop and restart this audit app.');
}
async function retriesAndSwitches(){
 check(work.stage==='offline-saved','offline phase restored after restart');
 const original=work.original;
 loseReceipt=true;
 await refused(()=>client.persistLegacyJsaEvidence(work.record),'lost receipt response keeps native work pending');
 check(work.pending===true,'no false completed status');
 await client.persistLegacyJsaEvidence(work.record);await client.persistLegacyJsaEvidence(work.record);
 log('PASS identical native receipt replay confirmed');
 await select('b');const calls=transportCalls;
 await refused(()=>client.persistLegacyJsaEvidence(work.record),'company B cannot adopt A original');
 check(transportCalls===calls,'foreign original stopped before callable');
 await refused(()=>client.legacyEvidenceCall({operation:'get_receipt',requestId:work.record.legacyReceiptBinding.requestId}),'authenticated server refuses foreign receipt');
 const bList=await client.legacyEvidenceCall({operation:'list'});check(bList.records.length===0,'B history contains no A evidence');
 const disk=JSON.parse((await AsyncStorage.getItem(KEY))!);check(disk.original===original&&disk.pending,'company switch preserves A pending original');
 await select('a');switchAfter=true;
 await refused(()=>client.persistLegacyJsaEvidence(work.record),'account switch during response cannot confirm A');
 await select('a');await client.persistLegacyJsaEvidence(work.record);
 const receipt=await client.legacyEvidenceCall({operation:'get_receipt',requestId:work.record.legacyReceiptBinding.requestId});
 check(receipt.receipt.completedAt===work.record.timestamp,'original signature time retained');
 const proof=await fetch(BASE+'/verify').then(r=>r.json());
 check(proof.originalUnchanged&&proof.signedCount===1,'exactly one unchanged signed emulator record');
 check(proof.receiptCount===1&&proof.receiptTimeUnchanged,'exactly one original-time emulator receipt');
 check(JSON.stringify(work.record)===original,'A to B to A never alters signed snapshot');
 work.stage='passed';work.pending=false;work.proof=proof;work.lines=[...lines];await save();
 const final=JSON.parse((await AsyncStorage.getItem(KEY))!);check(final.original===original&&!final.pending,'native completion persisted only after proof');
 await fetch(BASE+'/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'native-passed',engine:'Hermes',storage:'native AsyncStorage',auth:'persisted Firebase Auth emulator',transport:'Firebase Functions emulator callable',lines,proof})});
 log('NATIVE TEST COMPLETE');
}
function App(){const [,setTick]=useState(0),[busy,setBusy]=useState(false);useEffect(()=>{render=()=>setTick(t=>t+1);void initialize().catch(e=>{log('FAIL '+e.message);void SplashScreen.hideAsync();});return()=>{render=()=>{};};},[]);
 const action=(fn:()=>Promise<void>)=>{setBusy(true);void run(fn).finally(()=>setBusy(false));};
 return <View style={{flex:1,backgroundColor:'#111',paddingTop:48,paddingHorizontal:20}}><Text style={{color:'#f5c928',fontSize:24}}>Native JSA audit</Text><Text style={{color:'#bbb',marginVertical:12}}>Synthetic data • local emulators only{ '\n'}Installed Tickets/JSA work is separate.</Text><Pressable disabled={busy||!work} onPress={()=>action(offlineSave)} style={{backgroundColor:'#e9b929',padding:18,marginBottom:12}}><Text>1. Save offline test</Text></Pressable><Pressable disabled={busy||!work} onPress={()=>action(retriesAndSwitches)} style={{backgroundColor:'#e9b929',padding:18,marginBottom:12}}><Text>2. Retry and switch companies</Text></Pressable><ScrollView><Text selectable style={{color:'#ddd',fontSize:15,paddingBottom:50}}>{lines.join('\n')}</Text></ScrollView></View>;
}
registerRootComponent(App);
