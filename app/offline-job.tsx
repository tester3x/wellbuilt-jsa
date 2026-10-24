import React,{useEffect,useMemo,useState} from 'react';
import {ActivityIndicator,BackHandler,Linking,Text,View} from 'react-native';
import {Stack,useLocalSearchParams} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {PreparedReadContext,resolvePreparedRead,recordPreparedRead,type PreparedReadFlow} from '../services/PreparedJsaFlow';
import {preparedShiftJsa} from '../services/preparedShiftJsa';
import {readAttestationDraft,writeAttestationDraft} from '../services/sso/jsaAttestationScope';
import StepsScreen from './steps';
import PpeScreen from './ppe';
import SignoffScreen from './signoff';
import {useTheme} from './contexts/ThemeContext';

/** Protected offline transport entry. All form UI is the original JSA screens. */
export default function OfflineJob(){
 const {requestId:raw}=useLocalSearchParams<{requestId:string}>(),id=typeof raw==='string'?raw:'';
 const {accent}=useTheme();
 const [verified,setVerified]=useState<Awaited<ReturnType<typeof resolvePreparedRead>>|null>(null);
 const [params,setParams]=useState<Record<string,string>>({});
 const [screen,setScreen]=useState<'steps'|'ppe'|'signoff'>('steps');
 const [savedDraft,setSavedDraft]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;setVerified(null);setError('');void(async()=>{
  const current=await resolvePreparedRead(id);
  if(await preparedShiftJsa.proof(current.request.job.jobRef)){
   await Linking.openURL('wellbuilt-tickets://jsa-return?v=1&requestId='+encodeURIComponent(id)+'&status=completed');return;
  }
  const old=JSON.parse(await AsyncStorage.getItem('preparedJsaDraft/'+id)||'null');
  const scope={kind:'governed' as const,scopeId:id},draft=await readAttestationDraft(AsyncStorage,scope);
  if(old && !Object.keys(draft.stepAcks).length){
   const stepAcks=old.stepAcks||{};
   if(!await writeAttestationDraft(AsyncStorage,scope,{stepAcks,prepared:old.prepared||{},ppeSelected:old.ppeSelected||{},
    stepsAcknowledged:current.assessment.steps.every((s:any)=>stepAcks[s.id]===true)}))throw Error('Could not preserve your JSA draft. Please retry.');
  }
  const profile=await import('../services/driverAuth').then(m=>m.fetchDriverProfile()).catch(()=>null);
  const base={driverName:String(current.request.job.driverName||profile?.legalName||''),truckNumber:String(current.request.job.truckNumber||profile?.truckNumber||''),
   date:current.request.grant.policyDay,operator:current.request.job.operator,wellName:current.request.job.wellName,
   jobActivityName:current.request.job.jobType,assessmentSteps:JSON.stringify(current.assessment.steps),assessmentBundle:JSON.stringify(current.assessment)};
  if(live){setSavedDraft(old);setParams(base);setVerified(current);}
 })().catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[id]);
 const flow=useMemo<PreparedReadFlow|null>(()=>verified?{
  params,assessment:verified.assessment,savedDraft,
  resolve:()=>resolvePreparedRead(id),
  navigate:href=>{if(!['/ppe','/signoff'].includes(href.pathname))throw Error('Invalid prepared JSA stage');
   setParams(p=>({...p,...Object.fromEntries(Object.entries(href.params||{}).filter(([,v])=>typeof v==='string')),
    assessmentSteps:JSON.stringify(verified.assessment.steps),assessmentBundle:JSON.stringify(verified.assessment)}));
   setScreen(href.pathname==='/ppe'?'ppe':'signoff');},
  back:()=>setScreen(screen==='signoff'?'ppe':'steps'),
  submit:snapshot=>recordPreparedRead(id,verified.request.grant.id,verified.assessment.contentHash,snapshot),
 }:null,[verified,params,savedDraft,id,screen]);
 useEffect(()=>{if(screen==='steps')return;const sub=BackHandler.addEventListener('hardwareBackPress',()=>{flow?.back();return true;});return()=>sub.remove();},[flow,screen]);
 if(!flow)return <View style={{flex:1,justifyContent:'center',padding:20}}><Stack.Screen options={{title:'JSA'}}/>{error?<Text accessibilityRole="alert">{error}</Text>:<ActivityIndicator size="large" color={accent}/>}</View>;
 return <PreparedReadContext.Provider value={flow}>{screen==='steps'?<StepsScreen/>:screen==='ppe'?<PpeScreen/>:<SignoffScreen/>}</PreparedReadContext.Provider>;
}
