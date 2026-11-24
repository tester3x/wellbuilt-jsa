import './runtime';
import React,{useEffect,useMemo,useState} from 'react';
import {BackHandler,Linking,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {registerRootComponent} from 'expo';
import * as SplashScreen from 'expo-splash-screen';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {role,ready,boot,call,owner} from './runtime';
import {assessment} from './adapters';
import {LanguageProvider} from '../../app/contexts/LanguageContext';
import {PreparedReadContext} from '../../services/PreparedJsaFlow';
import Steps from '../../app/steps';
import Ppe from '../../app/ppe';
import Signoff from '../../app/signoff';
import {decideGovernedJobPopulate,applyGovernedJobHandoff} from '../../services/sso/jsaGovernedJobFields';
import {createJsaHandoffCoordinator} from '../../../TicketTimeExpo/tmp/wbt-jobtype-regression/utils/jsaHandoffCoordinator';
import {verifiedStartRead} from '../../../TicketTimeExpo/tmp/wbt-jobtype-regression/utils/jsaStartGateCore';
const KEY='@guidedAudit/v1';
const button=(label:string,fn:()=>void)=><Pressable accessibilityRole="button" onPress={fn} style={{padding:18,backgroundColor:'#DAA520',margin:12}}><Text>{label}</Text></Pressable>;
function App(){
 const [status,setStatus]=useState('Connecting local emulators…'),[loaded,setLoaded]=useState(false),[context,setContext]=useState<any>(null),[params,setParams]=useState<any>({}),[screen,setScreen]=useState('steps');
 const [request,setRequest]=useState('');
 async function receive(url:string|null){
  if(!url)return;const parsed=new URL(url),id=parsed.searchParams.get('requestId');
  if(!id||!/^[-_A-Za-z0-9]{43}$/.test(id))throw Error('Invalid request');
  if(role==='wbt'){
   if(parsed.protocol!=='wb-audit-tickets:'||parsed.hostname!=='jsa-return')throw Error('Wrong return route');
   const pending=JSON.parse((await AsyncStorage.getItem(KEY))||'null');
   if(!pending||pending.requestId!==id)throw Error('Return has no matching local request');
   const result=await call('jsaConsumeReadResult',{requestId:id,jobRef:pending.jobRef});
   if(!verifiedStartRead(pending,result))throw Error('Return not verified');
   await AsyncStorage.setItem(KEY,JSON.stringify({...pending,verified:result}));setStatus('PASS: authenticated JSA return verified. Test job may start.');
  }else{
   if(parsed.protocol!=='wb-audit-jsa:'||parsed.hostname!=='start')throw Error('Wrong launch route');
   const c=await call('jsaGetReadRequest',{requestId:id});
   if(c.requestId!==id||c.state!=='pending'||c.jobRef!==boot.run+'-job')throw Error('Request mismatch');
   setRequest(id);setContext(c);setParams({wellName:c.wellName,operator:c.operator,jobActivityName:c.jobType,date:new Date().toISOString().slice(0,10),truckNumber:'AUDIT',assessmentSteps:JSON.stringify(assessment.steps),assessmentBundle:JSON.stringify(assessment)});
   await AsyncStorage.setItem(KEY,JSON.stringify({requestId:id,context:c}));setStatus('Review the normal guided pages. Emulator data only.');
  }
 }
 useEffect(()=>{let live=true;let sub:any;
  ready().then(async()=>{if(!live)return;setLoaded(true);setStatus(role==='wbt'?'Ready to open the test job’s JSA.':'Waiting for test Tickets handoff.');sub=Linking.addEventListener('url',e=>void receive(e.url).catch(e=>setStatus(e.message)));await receive(await Linking.getInitialURL());}).catch(e=>setStatus(e.message)).finally(()=>void SplashScreen.hideAsync());
  return()=>{live=false;sub?.remove();};
 },[]);
 const resolve=useMemo(()=>async()=>{const c=await call('jsaGetReadRequest',{requestId:request});const populate=decideGovernedJobPopulate({launchRequestId:request,context:c,explicitFailure:false});if(populate.kind!=='populate')throw Error('Request is no longer pending');return {populate,handoff:applyGovernedJobHandoff({populate,wellsParam:'[]',wellNameParam:'',jobActivityParam:''}),hasLaunch:true};},[request]);
 const flow=useMemo<any>(()=>context?{params,assessment,resolve,
  navigate:(href:any)=>{setParams((p:any)=>({...p,...href.params}));setScreen(href.pathname==='/ppe'?'ppe':'signoff');},
  back:()=>setScreen(screen==='signoff'?'ppe':'steps'),
  submit:async(snapshot:any)=>{
   // Freeze user-authored evidence before any transport. Never edit it on retry.
   const key=KEY+'/signed/'+request,prior=await AsyncStorage.getItem(key),original=prior?JSON.parse(prior):snapshot;
   if(prior&&JSON.stringify(original)!==JSON.stringify(snapshot))throw Error('Signed original retained; retry that original');
   if(!prior)await AsyncStorage.setItem(key,JSON.stringify(original));
   await call('jsaCompleteReadRequest',{requestId:request,action:'read_and_acknowledged'});
   await call('jsaPersistGovernedArtifact',{requestId:request,snapshot:original});
   const after=await AsyncStorage.getItem(key);if(after!==JSON.stringify(original))throw Error('Signed local original changed');
   return 'wb-audit-tickets://jsa-return?v=1&requestId='+request+'&status=read';
  }}:null,[context,params,resolve,screen,request]);
 async function start(){try{
  const current=await owner();if(!current)throw Error('No audit owner');
  const policy=await call('jsaResolveJobShiftEvidence',{protocolVersion:1,jobRef:boot.run+'-job',purpose:'start'});
  const coordinator=createJsaHandoffCoordinator({scope:()=>current as any,get:k=>AsyncStorage.getItem(k),set:(k,v)=>AsyncStorage.setItem(k,v),mintRequestId:()=>require('../../services/sso/jsaPkce').encodeB64Url32(Crypto.getRandomBytes(32)),register:body=>call('jsaRegisterJobShiftReadRequest',body)});
  const result=await coordinator.prepare({invoiceDocId:boot.run+'-job',dispatchId:null,intent:'read_and_acknowledge'});
  await AsyncStorage.setItem(KEY,JSON.stringify({requestId:result.requestId,jobRef:boot.run+'-job',periodId:'',policyDay:policy.policyDay,requirementKey:policy.requirementKey,intent:'read_and_acknowledge'}));
  await Linking.openURL(result.url.replace('jsaapp://','wb-audit-jsa://'));
 }catch(e){setStatus(e instanceof Error?e.message:String(e));}}
 return <SafeAreaProvider><LanguageProvider><View style={{flex:1,backgroundColor:'#111',paddingTop:32}}><Text style={{color:'#DAA520',padding:12}}>LOCAL EMULATOR • {role==='wbt'?'Tickets handoff test':'JSA guided test'}</Text><Text style={{color:'#ddd',paddingHorizontal:12}}>{status}</Text>{role==='wbt'?<ScrollView>{loaded&&button('Open test job JSA',()=>void start())}</ScrollView>:flow?<PreparedReadContext.Provider value={flow}>{screen==='steps'?<Steps/>:screen==='ppe'?<Ppe/>:<Signoff/>}</PreparedReadContext.Provider>:null}</View></LanguageProvider></SafeAreaProvider>;
}
registerRootComponent(App);
