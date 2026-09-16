import React,{useCallback,useRef,useState} from 'react';
import {ActivityIndicator,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {Ionicons} from '@expo/vector-icons';
import {ownJsaRecord} from '../services/jsaRecord';
import {jsaDocumentHtml,recordCustomer,signingTime} from '../services/jsaDocument';
import {JsaSummaryCard,buildLocationActivityRows} from '../components/jsa';
import MoreMenu from '../components/MoreMenu';
import JsaPrintModal from '../components/JsaPrintModal';
import BottomActionBar from '../components/BottomActionBar';
import OperatorHeader from '../components/OperatorHeader';
import {useLanguage} from './contexts/LanguageContext';
export default function JsaRecord(){const {id}=useLocalSearchParams<{id:string}>(),router=useRouter(),{lang,t}=useLanguage();const locale=lang==='es'?'es-MX':'en-US';const [record,setRecord]=useState<any>(null),[error,setError]=useState(''),[read,setRead]=useState(true),[printing,setPrinting]=useState(false);const returnToPrint=useRef(false);
 useFocusEffect(useCallback(()=>{let active=true;setError('');ownJsaRecord(id).then(async r=>{if(active){setRecord(r);if(returnToPrint.current){setPrinting(true);returnToPrint.current=false;}}if(r.workflow==='standalone'){try{await(await import('../services/standaloneJsa')).syncStandaloneHistory();r=await ownJsaRecord(id);}catch{/* keep owned local signed copy for offline reading */}}if(active){setRecord(r);if(returnToPrint.current){setPrinting(true);returnToPrint.current=false;}}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]));
 if(!record)return <View style={{padding:24}}>{error?<Text>{t(error)}</Text>:<ActivityIndicator/>}</View>;
 const canAddLocation=record.workflow==='standalone'&&record.state==='open';
 const rows=buildLocationActivityRows(record.wells||[],record.locations||[],{jobActivityName:record.jobActivityName||'',task:record.task||''});
 const action=(key:'Print'|'Saved JSAs',fn:()=>void)=><TouchableOpacity accessibilityRole="button" accessibilityLabel={t(key)} style={{width:88,maxWidth:'100%',alignItems:'center',justifyContent:'center',minHeight:52}} onPress={fn}><Ionicons name={key==='Print'?'print-outline':'time-outline'} size={25} color={key==='Print'?'#666':'#DAA520'}/><Text style={{fontSize:12,fontWeight:'600',color:key==='Print'?'#666':'#99710c'}}>{t(key)}</Text></TouchableOpacity>;
 return <SafeAreaView style={{flex:1,backgroundColor:'#f5f5f5'}} edges={[]}><Stack.Screen options={{title:recordCustomer(record),headerRight:()=>null,headerTitle:()=> <OperatorHeader name={recordCustomer(record)}/>}}/>
 {read?<View style={{flex:1}}><View style={{flexDirection:"row",justifyContent:"space-between",flexWrap:"wrap"}}><TouchableOpacity accessibilityRole="button" onPress={()=>setRead(false)} style={{padding:16,minHeight:48}}><Text style={{color:"#99710c",fontWeight:"700"}}>{t('JSA details')}</Text></TouchableOpacity>{canAddLocation&&<TouchableOpacity accessibilityRole="button" onPress={()=>router.push({pathname:"/add-location",params:{id}} as any)} style={{padding:16,minHeight:48}}><Text style={{color:"#99710c",fontWeight:"700"}}>＋ {t('Add location')}</Text></TouchableOpacity>}</View><WebView source={{html:jsaDocumentHtml(record,undefined,{t,locale})}} javaScriptEnabled={false} style={{flex:1}}/></View>:<ScrollView contentContainerStyle={{padding:18,gap:16}}><Text style={{fontSize:22,fontWeight:'700'}}>{t(record.state==='closed'?'Closed JSA':record.state==='open'?'Ongoing JSA':'Saved JSA')}</Text><View><JsaSummaryCard driverName={record.driverName} truckNumber={record.truckNumber} date={record.date} signedAt={signingTime(record.timestamp,locale)} rows={rows} onAddLocation={canAddLocation?()=>router.push({pathname:'/add-location',params:{id}} as any):undefined}/></View><TouchableOpacity accessibilityRole="button" onPress={()=>setRead(true)} style={{minHeight:48,justifyContent:"center"}}><Text style={{color:"#99710c",fontWeight:"700"}}>{t('Read this JSA')}</Text></TouchableOpacity>{(record.additions||[]).map((a:any,i:number)=><View key={a.id||i} style={{borderTopWidth:1,borderColor:"#ddd",paddingTop:8}}><Text style={{fontWeight:"700"}}>{t('Added:')} {a.location}</Text><Text>{a.activity} · {signingTime(a.acknowledgedAtMs,locale)}</Text></View>)}</ScrollView>}
 <BottomActionBar>{action('Print',()=>setPrinting(true))}{action('Saved JSAs',()=>router.push('/(tabs)/history' as any))}<MoreMenu placement="bottom"/></BottomActionBar>
 <JsaPrintModal visible={printing} record={record} onClose={()=>setPrinting(false)} onSettings={()=>{setPrinting(false);returnToPrint.current=true;router.push('/printer-settings' as any);}}/>
 </SafeAreaView>;
}

