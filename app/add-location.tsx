import TaskAssessmentPicker from '../components/TaskAssessmentPicker';
import {assembleTaskAssessments} from '../services/jsaTaskTemplates';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Keyboard,ScrollView,StyleSheet,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {Stack,useLocalSearchParams,useRouter} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {useTheme} from './contexts/ThemeContext';
import {fetchDriverProfile} from '../services/driverAuth';
import {loadDisposals,loadWellsForOperator,WellRecord} from '../services/wellData';
import {appendStandaloneLocation,getStandaloneRecord} from '../services/standaloneJsa';
import {locationAssessmentFields,selectedAssessmentLabels} from '../services/jsaAssessmentLabels';
import SearchResults,{SearchResult} from '../components/SearchResults';
import {useFormKeyboard} from '../components/useFormKeyboard';
import {useLanguage} from './contexts/LanguageContext';

export default function AddLocation(){
 const {id}=useLocalSearchParams<{id:string}>(),router=useRouter(),{accent}=useTheme(),{t}=useLanguage(),keyboard=useFormKeyboard();
 const companyRef=useRef<TextInput>(null),locationRef=useRef<TextInput>(null),activityRef=useRef<TextInput>(null);
 const hazardsRef=useRef<TextInput>(null),controlsRef=useRef<TextInput>(null),ppeRef=useRef<TextInput>(null);
 const [record,setRecord]=useState<any>(null),[error,setError]=useState(''),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const [operators,setOperators]=useState<string[]>([]),[operator,setOperator]=useState(''),[operatorQuery,setOperatorQuery]=useState('');
 const [wells,setWells]=useState<WellRecord[]>([]),[swds,setSwds]=useState<WellRecord[]>([]),[loadingWells,setLoadingWells]=useState(false);
 const [location,setLocation]=useState(''),[activity,setActivity]=useState(''),[focused,setFocused]=useState('');
 const [changes,setChanges]=useState(false),[details,setDetails]=useState({hazards:'',controls:'',ppe:''}),[saving,setSaving]=useState(false);
 const [choosingTask,setChoosingTask]=useState(false),[taskReview,setTaskReview]=useState<ReturnType<typeof assembleTaskAssessments>|null>(null),[taskAcks,setTaskAcks]=useState<Record<string,boolean>>({});
 const [additionId,setAdditionId]=useState('');
 useEffect(()=>{let active=true;setFailed(false);setError('');
  getStandaloneRecord(id).then(r=>{if(active){setRecord(r);setOperator(r.job.operator||'');setActivity(old=>old||r.job.activity||'');}}).catch(e=>{if(active){setError(e.message);setFailed(true);}});
  fetchDriverProfile().then(p=>{if(active)setOperators([...new Set((p?.assignedCustomers||[]).map(c=>c.name).filter(Boolean))]);}).catch(()=>{});
  loadDisposals().then(r=>{if(active)setSwds(r);}).catch(()=>{if(active)setError('SWDs could not load. You can enter a location manually.');});
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,Crypto.randomUUID()).then(v=>{if(active)setAdditionId(v.slice(0,43));});
  return()=>{active=false;};
 },[id,retry]);
 useEffect(()=>{let active=true;setWells([]);if(!operator)return;setLoadingWells(true);
  loadWellsForOperator(operator).then(r=>{if(active)setWells(r);}).catch(()=>{if(active)setError('Wells could not load. You can enter a location manually.');}).finally(()=>{if(active)setLoadingWells(false);});return()=>{active=false;};
 },[operator]);
 const button=(label:string,action:()=>void,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={action} style={[styles.button,{backgroundColor:accent,opacity:disabled?0.45:1}]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;
 const coveredHashes=[...(record?.job?.assessmentTemplates||[]),...(record?.additions||[]).flatMap((a:any)=>a.taskAssessment?.templates||[])].map((t:any)=>t.contentHash);
 const tasksRead=!taskReview||taskReview.steps.every(s=>taskAcks[s.id]===true);
 const valid=!!location.trim()&&!!activity.trim()&&(!changes||(!!details.hazards.trim()&&!!details.controls.trim()));
 const save=async()=>{if(saving||!record||!valid||!additionId||!tasksRead)return;setSaving(true);Keyboard.dismiss();
  try{
   await appendStandaloneLocation(record,additionId,{location:location.trim(),activity:activity.trim(),operator,conditionsDiffer:changes,...locationAssessmentFields(record,changes?details:undefined)},taskReview?{templateRefs:taskReview.templateRefs,stepAcks:taskAcks}:undefined);
   router.back();
  }catch(e){const message=e instanceof Error?e.message:'Retry when connected.';
   if(message.includes('review_latest_record')){try{setRecord(await getStandaloneRecord(id));setError('This JSA was updated. Check the locations below, then tap Acknowledge and add location again.');}catch{setError('Reopen this JSA when connected to review its latest additions.');}}
   else Alert.alert(t('Addition not confirmed'),t(message));
  }finally{setSaving(false);}
 };
 const matches=[...wells,...swds].filter(w=>w.well_name.toLowerCase().includes(location.trim().toLowerCase())&&w.well_name!==location).slice(0,50);
 return <View style={{flex:1,backgroundColor:'transparent'}}><Stack.Screen options={{title:t('Add location')}}/>
 <ScrollView ref={keyboard.scrollRef} {...keyboard.scrollProps} contentContainerStyle={[styles.content,{paddingBottom:24+keyboard.height}]}>
 {!!error&&<Text accessibilityRole="alert" style={styles.error}>{t(error)}</Text>}
 {!record?(failed?button(t('Retry loading JSA'),()=>setRetry(v=>v+1)):<ActivityIndicator color={accent}/>):record.state!=='open'?<Text>{t('This JSA is closed. Start a new JSA for additional work.')}</Text>:<>
 <Text style={styles.title}>{t('Add location')}</Text>
 <Text style={styles.help}>{t('Use the company assessment and PPE already recorded on this JSA.')}</Text>
 <Text style={styles.label}>{t('Oil company')}</Text>
 {record.job.operator?<Text>{record.job.operator}</Text>:<>
 <TextInput ref={companyRef} style={styles.input} value={operatorQuery} placeholder={t('Search your oil companies')} selectTextOnFocus autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={()=>locationRef.current?.focus()} onFocus={()=>{setFocused('company');keyboard.focus(companyRef.current,200);}} onBlur={()=>setTimeout(()=>setFocused(v=>v==='company'?'':v),200)} onChangeText={v=>{setOperatorQuery(v);setOperator('');}}/>
 {focused==='company'&&<SearchResults>{operators.filter(n=>n.toLowerCase().includes(operatorQuery.toLowerCase())).map(n=><SearchResult key={n} label={n} onPress={()=>{setOperator(n);setOperatorQuery(n);setLocation('');locationRef.current?.focus();}}/>)}</SearchResults>}
 </>}
 <Text style={styles.label}>{t('Well / location')}</Text>
 <TextInput ref={locationRef} style={styles.input} value={location} placeholder={t('Search wells / SWDs or enter location')} maxLength={300} selectTextOnFocus autoCorrect={false} returnKeyType="next" blurOnSubmit={false} onSubmitEditing={()=>activityRef.current?.focus()} onFocus={()=>{setFocused('location');keyboard.focus(locationRef.current,200);}} onBlur={()=>setTimeout(()=>setFocused(v=>v==='location'?'':v),200)} onChangeText={setLocation}/>
 {loadingWells&&<ActivityIndicator color={accent}/>}
 {focused==='location'&&location.trim().length>=2&&matches.length>0&&<SearchResults>{matches.map((w,i)=><SearchResult key={`${w.well_name}:${i}`} label={w.well_name} detail={w.locationKind==='swd'?'SWD':w.county?`${w.county} Co.`:undefined} onPress={()=>{setLocation(w.well_name);setFocused('');activityRef.current?.focus();}}/>)}</SearchResults>}
 <Text style={styles.label}>{t('Activity')}</Text>
 <TextInput ref={activityRef} style={styles.input} value={activity} maxLength={200} selectTextOnFocus returnKeyType="done" onFocus={()=>keyboard.focus(activityRef.current)} onChangeText={setActivity} onSubmitEditing={()=>Keyboard.dismiss()}/>
 <Text style={styles.label}>{t('PPE already selected')}</Text>
 <Text>{[...selectedAssessmentLabels(record.snapshot.ppeSelected,record.job.assessmentPpeItems).map(label=>t(label)),...(record.snapshot.ppeOtherItems||[])].join(', ')||t('See the original JSA.')}</Text>
 <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:changes}} style={styles.option} onPress={()=>setChanges(v=>!v)}><Text>{changes?'☑':'☐'} {t('Different hazards, controls, or PPE at this location')}</Text></TouchableOpacity>
 {changes&&([['hazards','Additional hazards',2000,hazardsRef],['controls','Controls for these differences',2000,controlsRef],['ppe','PPE changes (optional)',1000,ppeRef]] as const).map(([key,label,max,ref])=><View key={key}><Text style={styles.label}>{t(label)}</Text><TextInput ref={ref} multiline style={styles.input} value={details[key]} maxLength={max} onFocus={()=>keyboard.focus(ref.current)} onChangeText={v=>setDetails(old=>({...old,[key]:v}))}/></View>)}
 {record.job.assessmentTemplates&&<>
 {choosingTask?<TaskAssessmentPicker excludedHashes={coveredHashes} onChoose={selection=>{setTaskReview(selection);setTaskAcks({});setChoosingTask(false);}}/>:<TouchableOpacity style={styles.option} onPress={()=>setChoosingTask(true)}><Text style={{color:accent}}>＋ {t('Different company task assessment')}</Text></TouchableOpacity>}
 {taskReview?.steps.map(step=><View key={step.id} style={styles.option}><Text style={styles.label}>{step.title}</Text>{step.items.map((item,i)=><View key={i}><Text>{t('Hazard:')} {item.hazard}</Text><Text>{t('Controls:')} {item.controls}</Text></View>)}<TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:taskAcks[step.id]===true}} disabled={saving} onPress={()=>setTaskAcks(old=>({...old,[step.id]:!old[step.id]}))}><Text>{taskAcks[step.id]?'☑':'☐'} {t('I have read this step and its controls.')}</Text></TouchableOpacity></View>)}
 </>}
 <Text style={styles.help}>{t('By adding this location, I acknowledge that I have reviewed this work and the applicable hazards, controls, and PPE in this JSA.')}</Text>
 {button(t(saving?'Adding…':'Acknowledge and add location'),()=>void save(),saving||!valid||!additionId||!tasksRead)}
 {!!record.additions?.length&&<><Text style={styles.label}>{t('Already added')}</Text>{record.additions.map((a:any)=><Text key={a.id}>{a.location} · {a.activity}</Text>)}</>}
 </>}
 </ScrollView></View>;
}
const styles=StyleSheet.create({content:{padding:16},title:{fontSize:22,fontWeight:'700'},help:{fontSize:14,lineHeight:20,marginVertical:10,color:'#555'},label:{fontSize:15,fontWeight:'600',marginTop:14,marginBottom:6},input:{backgroundColor:'white',borderColor:'#ccc',borderWidth:1,borderRadius:8,padding:12,fontSize:17},option:{paddingVertical:12,marginTop:6},button:{padding:16,borderRadius:10,marginTop:8},buttonText:{color:'white',textAlign:'center',fontWeight:'700',fontSize:17},error:{color:'#a32626',marginBottom:12}});
