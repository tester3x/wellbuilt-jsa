import TaskAssessmentPicker from '../components/TaskAssessmentPicker';
import {assembleTaskAssessments} from '../services/jsaTaskTemplates';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useTheme } from './contexts/ThemeContext';
import { fetchDriverProfile } from '../services/driverAuth';
import { loadDisposals, loadWellsForOperator, WellRecord } from '../services/wellData';
import { appendStandaloneLocation, getStandaloneRecord } from '../services/standaloneJsa';
import { PPE_ITEMS } from '../constants/jsaTemplate';

export default function AddLocation(){
  const { id }=useLocalSearchParams<{id:string}>();
  const router=useRouter();
  const {accent}=useTheme();
  const [record,setRecord]=useState<any>(null),[error,setError]=useState('');
  const [recordFailed,setRecordFailed]=useState(false),[retry,setRetry]=useState(0);
  const [operators,setOperators]=useState<string[]>([]),[operator,setOperator]=useState('');
  const [operatorQuery,setOperatorQuery]=useState('');
  const [wells,setWells]=useState<WellRecord[]>([]),[swds,setSwds]=useState<WellRecord[]>([]);
  const [loadingWells,setLoadingWells]=useState(false);
  const [fields,setFields]=useState({location:'',activity:'',hazards:'',controls:'',ppe:''});
  const [review,setReview]=useState(false),[ack,setAck]=useState(false),[saving,setSaving]=useState(false);
  const [choosingTask,setChoosingTask]=useState(false);
  const [taskReview,setTaskReview]=useState<ReturnType<typeof assembleTaskAssessments>|null>(null);
  const [taskAcks,setTaskAcks]=useState<Record<string,boolean>>({});
  const [additionId,setAdditionId]=useState('');
  const [companyFocused,setCompanyFocused]=useState(false),[locationFocused,setLocationFocused]=useState(false);
  useEffect(()=>{let active=true;setRecordFailed(false);
    getStandaloneRecord(id).then(r=>{if(active){setRecord(r);setOperator(r.job.operator || '');setFields(old=>({...old,activity:old.activity||r.job.activity||'',ppe:old.ppe||[...Object.keys(r.snapshot.ppeSelected||{}).filter(k=>r.snapshot.ppeSelected[k]).map(k=>PPE_ITEMS.find(p=>p.id===k)?.label||k),...(r.snapshot.ppeOtherItems||[])].join(', ')}));}}).catch(e=>{if(active){setError(e.message);setRecordFailed(true);}});
    fetchDriverProfile().then(p=>{if(active)setOperators([...new Set((p?.assignedCustomers || []).map(c=>c.name).filter(Boolean))]);}).catch(()=>{if(active)setError('Oil companies could not load. Manual locations remain available.');});
    loadDisposals().then(r=>{if(active)setSwds(r);}).catch(()=>{if(active)setError('SWDs could not load. Manual locations remain available.');});
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,Crypto.randomUUID()).then(v=>{if(active)setAdditionId(v.slice(0,43));});
    return()=>{active=false;};
  },[id,retry]);
  useEffect(()=>{let active=true;setWells([]);if(!operator){setLoadingWells(false);return;}
    setLoadingWells(true);
    loadWellsForOperator(operator).then(r=>{if(active)setWells(r);}).catch(()=>{if(active)setError('Wells could not load. Enter the location manually or select the oil company again.');}).finally(()=>{if(active)setLoadingWells(false);});
    return()=>{active=false;};
  },[operator]);
  const update=(key:keyof typeof fields,value:string)=>{setFields(old=>({...old,[key]:value}));setAck(false);};
  const button=(label:string,onPress:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,{backgroundColor:accent,opacity:disabled ? 0.45 : 1}]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
  const valid=Object.values(fields).every(v=>v.trim());
  const tasksRead=!taskReview || taskReview.steps.every(step=>taskAcks[step.id]===true);
  const coveredHashes=[...(record?.job?.assessmentTemplates||[]),...(record?.additions||[]).flatMap((a:any)=>a.taskAssessment?.templates||[])].map((t:any)=>t.contentHash);
  const save=async()=>{if(saving||!ack||!valid||!record||!tasksRead)return;setSaving(true);
    try{await appendStandaloneLocation(record,additionId,{...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.trim()])) as typeof fields,operator},taskReview?{templateRefs:taskReview.templateRefs,stepAcks:taskAcks}:undefined);Alert.alert('Location added','Your acknowledgement is saved with this JSA.',[{text:'Done',onPress:()=>router.back()}]);}
    catch(e){
      const message=e instanceof Error?e.message:'Retry when connected.';
      if(message.includes('review_latest_record')){
        try{setRecord(await getStandaloneRecord(id));setAck(false);Alert.alert('JSA updated','Another addition was saved. Review the updated list before acknowledging yours.');}
        catch{Alert.alert('Reload required','Reopen this JSA when connected to review its latest additions.');}
      }else Alert.alert('Addition not confirmed',message);
    }
    finally{setSaving(false);}
  };
  return <KeyboardAvoidingView style={{flex:1,backgroundColor:'#f5f5f5'}} behavior={Platform.OS==='ios'?'padding':'height'}>
    <Stack.Screen options={{title:'Add location / activity'}}/>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!record?(recordFailed?button('Retry loading JSA',()=>{setError('');setRetry(v=>v+1);}):<ActivityIndicator color={accent}/>):record.state!=='open'?<Text>This JSA is closed. Start a new JSA for additional work.</Text>:<>
        <Text style={styles.title}>{review?'Review this addition':'Add the next location'}</Text>
        <Text style={styles.help}>Add a location when you know it. The original signed JSA stays unchanged. Review conditions before starting the added work.</Text>
        {!review?<>
          {record.job.assessmentTemplates && <>
            {choosingTask ? <TaskAssessmentPicker excludedHashes={coveredHashes} onChoose={selection=>{setTaskReview(selection);setTaskAcks({});setAck(false);setChoosingTask(false);}}/> : button(taskReview?'Change added assessment':'＋ Add a different task assessment',()=>setChoosingTask(true))}
            {taskReview && <Text>New assessment: {taskReview.templates.map(t=>t.name).join(', ')}</Text>}
          </>}
          <Text style={styles.label}>Oil company</Text>
          {record.job.operator?<Text>{record.job.operator} · Use a new JSA for another oil company.</Text>:<>
          <TextInput style={styles.input} placeholder="Search your oil companies" value={operatorQuery} selectTextOnFocus autoCorrect={false}
            onFocus={()=>setCompanyFocused(true)} onBlur={()=>setTimeout(()=>setCompanyFocused(false),200)}
            onChangeText={text=>{setOperatorQuery(text);setCompanyFocused(true);if(text!==operator){setOperator('');setAck(false);}}}/>
          {companyFocused&&<ScrollView style={{maxHeight:220}} nestedScrollEnabled keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {operators.filter(n=>n.toLowerCase().includes(operatorQuery.toLowerCase())).map(n=><TouchableOpacity key={n} onPress={()=>{setOperator(n);setOperatorQuery(n);setCompanyFocused(false);update('location','');}} style={styles.option}><Text>{n}</Text></TouchableOpacity>)}
          </ScrollView>}
          </>}
          <Text style={styles.label}>Well / location</Text>
          <TextInput style={styles.input} value={fields.location} selectTextOnFocus autoCorrect={false}
            onFocus={()=>setLocationFocused(true)} onBlur={()=>setTimeout(()=>setLocationFocused(false),200)}
            onChangeText={v=>{update('location',v);setLocationFocused(true);}} placeholder="Search or enter a location" maxLength={300}/>
          {loadingWells&&<ActivityIndicator color={accent}/>}
          {locationFocused&&fields.location.trim().length>=2&&<ScrollView style={{maxHeight:220}} nestedScrollEnabled keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
          {[...wells,...swds].filter(w=>w.well_name.toLowerCase().includes(fields.location.toLowerCase())&&w.well_name!==fields.location).map((w,i)=><TouchableOpacity key={`${w.well_name}:${i}`} style={styles.option} onPress={()=>{update('location',w.well_name);setLocationFocused(false);}}><Text>{w.well_name}</Text></TouchableOpacity>)}
          </ScrollView>}
          {([['activity','Activity',200],['hazards','Hazards at this location',2000],['controls','Controls / safe work steps',2000],['ppe','PPE for this work',1000]] as const).map(([key,label,max])=><View key={key}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} multiline={key!=='activity'} maxLength={max} value={fields[key]} onChangeText={v=>update(key,v)}/></View>)}
          {button('Review addition',()=>setReview(true),!valid)}
        </>:<>
          <Text style={styles.label}>Original JSA</Text><Text>{record.snapshot.printedName} · {record.snapshot.formDate}</Text>
          {(record.additions || []).length>0&&<View><Text style={styles.label}>Already added</Text>{record.additions.map((a:any)=><Text key={a.id}>{a.location} · {a.activity}</Text>)}</View>}
          {Object.entries(fields).map(([key,value])=><View key={key} style={styles.option}><Text style={styles.label}>{key==='ppe'?'PPE':key.charAt(0).toUpperCase()+key.slice(1)}</Text><Text>{value}</Text></View>)}
          {taskReview?.steps.map(step=><View key={step.id} style={styles.option}><Text style={styles.label}>{step.title}</Text>{step.items.map((item,i)=><View key={i}><Text>Hazard: {item.hazard}</Text><Text>Controls: {item.controls}</Text></View>)}<TouchableOpacity disabled={saving} accessibilityRole="checkbox" accessibilityState={{checked:taskAcks[step.id]===true}} onPress={()=>{setTaskAcks(old=>({...old,[step.id]:!old[step.id]}));setAck(false);}} style={styles.option}><Text>{taskAcks[step.id]?'☑':'☐'} I have read this step and its controls.</Text></TouchableOpacity></View>)}
          {taskReview && <View><Text style={styles.label}>Assessment PPE and preparation</Text>{[...taskReview.ppeItems,...taskReview.preparedItems].map(item=><Text key={item.id}>{item.label}</Text>)}</View>}
          <Text style={styles.help}>If the work or hazards differ from your original assessment, include the new hazards, controls, and PPE above before acknowledging.</Text>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:ack}} disabled={saving} onPress={()=>setAck(!ack)} style={styles.option}><Text>{ack?'☑':'☐'} I have reviewed this location and activity, assessed its hazards, and understand the controls and PPE needed before starting work.</Text></TouchableOpacity>
          {button(saving?'Saving…':'Acknowledge and add',()=>{void save();},saving||!ack||!additionId||!tasksRead)}
          {button('Edit addition',()=>{setReview(false);setAck(false);},saving)}
        </>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({content:{padding:20,paddingBottom:100},title:{fontSize:24,fontWeight:'700',marginBottom:12},help:{fontSize:16,lineHeight:23,marginVertical:12,color:'#555'},label:{fontSize:17,fontWeight:'600',marginTop:14,marginBottom:6},input:{backgroundColor:'white',borderColor:'#bbb',borderWidth:1,borderRadius:10,padding:14,fontSize:17},option:{padding:12,backgroundColor:'white',marginVertical:4,borderRadius:8},button:{padding:16,borderRadius:12,marginTop:14},buttonText:{color:'white',textAlign:'center',fontWeight:'700',fontSize:18},error:{color:'#a32626',marginBottom:12}});
