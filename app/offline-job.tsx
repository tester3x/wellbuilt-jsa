import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Pressable,ActivityIndicator,Linking} from 'react-native';
import {useLocalSearchParams,Stack} from 'expo-router';
import PreparedJsaForm from '../components/PreparedJsaForm';
import MoreMenu from '../components/MoreMenu';
import {useLanguage} from './contexts/LanguageContext';
import {useTheme} from './contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SignatureModal from '../components/SignatureModal';
import {preparedShiftJsa} from '../services/preparedShiftJsa';

const initial={stepAcks:{} as Record<string,boolean>,prepared:{} as Record<string,boolean>,ppeSelected:{} as Record<string,boolean>,printedName:'',signature:'',notes:''};

/** Full authored read against the exact server-prepared content. The request ID
 * alone carries no authority: the protected peer record must match this account,
 * active shift, operator and original job before any content/action is used. */
export default function OfflineJob(){
 const {accent}=useTheme();const {t}=useLanguage();
 const {requestId:raw}=useLocalSearchParams<{requestId:string}>();const id=typeof raw==='string'?raw:'';
 const [request,setRequest]=useState<any>(null),[assessment,setAssessment]=useState<any>(null),[draft,setDraft]=useState(initial);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[drawing,setDrawing]=useState(false),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 const save=useRef<Promise<void>>(Promise.resolve()),value=useRef(initial),flight=useRef(false);
 const key='preparedJsaDraft/'+id;
 const update=(next:typeof initial)=>{value.current=next;setDraft(next);save.current=save.current.catch(()=>{}).then(()=>AsyncStorage.setItem(key,JSON.stringify(next)));save.current.catch(()=>setError('Could not save this draft. Please retry before leaving.'));return save.current;};
 useEffect(()=>{let live=true;setLoading(true);setError('');void(async()=>{
  if(!/^[A-Za-z0-9_-]{43}$/.test(id))throw Error('Invalid JSA request. Return to Tickets and reopen this job.');
  const r=await preparedShiftJsa.readRequest(id);if(!r)throw Error('This JSA request does not match the prepared shift. Return to Tickets.');
  const exact=r.grant.assessments.filter((a:any)=>a.packageId===r.job.packageId),defaults=r.grant.assessments.filter((a:any)=>a.packageId===null);
  const candidates=exact.length?exact:defaults;
  const task=String(r.job.jobType||'').trim().toLowerCase();
  const matches=candidates.filter((a:any)=>a.tasks.some((s:string)=>s.trim().toLowerCase()===task));
  const applicable=matches.length?matches:candidates.filter((a:any)=>!a.tasks.length);
  if(applicable.length!==1)throw Error('The applicable JSA assessment was not prepared unambiguously. Connect to refresh shift preparation.');
  const stored=JSON.parse(await AsyncStorage.getItem(key)||'null');
  const proof=await preparedShiftJsa.proof(r.job.jobRef);
  if(live){setRequest(r);setAssessment(applicable[0]);if(stored){value.current={...initial,...stored};setDraft(value.current);}setDone(!!proof);}
 })().catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[id,key]);
 const returnToTickets=()=>Linking.openURL('wellbuilt-tickets://jsa-return?v=1&requestId='+encodeURIComponent(id)+'&status=completed');
 const submit=async()=>{if(flight.current||!request||!assessment)return;flight.current=true;setBusy(true);setError('');try{
  await save.current;const d=value.current;
  if(!d.printedName.trim()||!d.signature||assessment.steps.some((s:any)=>d.stepAcks[s.id]!==true)||assessment.preparedItems.some((s:any)=>d.prepared[s.id]!==true))throw Error('Confirm every step and prepared-for-work item, enter your legal name and sign before submitting.');
  const current=await preparedShiftJsa.readRequest(id);if(!current||current.grant.id!==request.grant.id)throw Error('The prepared shift changed. Reopen this job from Tickets.');
  await preparedShiftJsa.record(request.job.jobRef,request.job.operator,'read',{assessmentHash:assessment.contentHash,snapshot:{
   prepared:d.prepared,locationAcks:{},locations:[],stepsAcknowledged:true,stepAcks:d.stepAcks,ppeSelected:d.ppeSelected,ppeOtherItems:[],notes:d.notes.trim(),pusher:'',otherInfo:'',printedName:d.printedName.trim(),
   signature:{mimeType:'image/png',data:d.signature.replace(/^data:image\/png;base64,/,'')},truckNumber:String(request.job.truckNumber||''),formDate:request.grant.policyDay,
  }},request.grant.id);
  setDone(true);void preparedShiftJsa.drain().catch(()=>{});await returnToTickets();
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{flight.current=false;setBusy(false);}};
 return <><Stack.Screen options={{title:t('Review & Submit'),headerRight:()=> <MoreMenu/>}}/>
  {loading?<ActivityIndicator size="large" color={accent}/>:done?<View style={{padding:20,gap:16}}>
   <Text style={{fontSize:18,color:'#176338'}}>JSA saved on this device. It will send automatically when connected.</Text>
   <Pressable onPress={()=>{void returnToTickets();}} style={{backgroundColor:accent,padding:20,borderRadius:12}}><Text style={{textAlign:'center',fontSize:19,fontWeight:'700'}}>Return to Tickets</Text></Pressable>
  </View>:assessment&&request?<PreparedJsaForm request={request} assessment={assessment} draft={draft} update={update}
   busy={busy} error={error} onSign={()=>setDrawing(true)} onSubmit={()=>{void submit();}}/>
   :<Text accessibilityRole="alert" style={{color:'#a51919',fontSize:18,padding:20}}>{error}</Text>}
  <SignatureModal visible={drawing} onClose={()=>setDrawing(false)} accent={accent} onSave={signature=>update({...value.current,signature})}/></>;
}
