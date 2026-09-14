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
export default function JsaRecord(){const {id}=useLocalSearchParams<{id:string}>(),router=useRouter();const [record,setRecord]=useState<any>(null),[error,setError]=useState(''),[read,setRead]=useState(false),[printing,setPrinting]=useState(false);const returnToPrint=useRef(false);
 useFocusEffect(useCallback(()=>{let active=true;setError('');ownJsaRecord(id).then(async r=>{if(active){setRecord(r);if(returnToPrint.current){setPrinting(true);returnToPrint.current=false;}}if(r.workflow==='standalone'){try{await(await import('../services/standaloneJsa')).syncStandaloneHistory();r=await ownJsaRecord(id);}catch{/* keep owned local signed copy for offline reading */}}if(active){setRecord(r);if(returnToPrint.current){setPrinting(true);returnToPrint.current=false;}}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]));
 if(!record)return <View style={{padding:24}}>{error?<Text>{error}</Text>:<ActivityIndicator/>}</View>;
 const rows=buildLocationActivityRows(record.wells||[],record.locations||[],{jobActivityName:record.jobActivityName||'',task:record.task||''});
 const action=(text:string,fn:()=>void)=><TouchableOpacity accessibilityRole="button" style={{flex:1,alignItems:'center',justifyContent:'center',minHeight:56}} onPress={fn}><Ionicons name={text==='Print'?'print-outline':'book-outline'} size={25} color={text==='Print'?'#666':'#DAA520'}/><Text style={{fontSize:12,fontWeight:'600',color:text==='Print'?'#666':'#99710c'}}>{text}</Text></TouchableOpacity>;
 return <SafeAreaView style={{flex:1,backgroundColor:'#f5f5f5'}} edges={['bottom']}><Stack.Screen options={{title:recordCustomer(record)}}/>
 {read?<WebView source={{html:jsaDocumentHtml(record)}} javaScriptEnabled={false} style={{flex:1}}/>:<ScrollView contentContainerStyle={{padding:18,gap:16}}><Text style={{fontSize:22,fontWeight:'700'}}>{record.state==='closed'?'Closed JSA':'Submitted JSA'}</Text><JsaSummaryCard driverName={record.driverName} truckNumber={record.truckNumber} date={record.date} rows={rows} onAddLocation={record.workflow==='standalone'&&record.state!=='closed'?()=>router.push({pathname:'/add-location',params:{id}} as any):undefined}/><Text>{recordCustomer(record)}</Text><Text>Signed by {record.driverLegalName||record.signature||record.driverName}{'\n'}{signingTime(record.timestamp)}</Text>{(record.additions||[]).map((a:any,i:number)=><View key={a.id||i} style={{borderTopWidth:1,borderColor:"#ddd",paddingTop:8}}><Text style={{fontWeight:"700"}}>Added: {a.location}</Text><Text>{a.activity} · {signingTime(a.acknowledgedAtMs)}</Text></View>)}<TouchableOpacity onPress={()=>router.push('/open-jsas' as any)}><Text style={{color:'#99710c',fontWeight:'700'}}>Open JSAs / End day</Text></TouchableOpacity></ScrollView>}
 <View style={{flexDirection:'row',backgroundColor:'white',borderTopWidth:1,borderColor:'#ddd'}}>{action('Print',()=>setPrinting(true))}{action(read?'JSA details':'Read JSA',()=>setRead(!read))}<MoreMenu placement="bottom"/></View>
 <JsaPrintModal visible={printing} record={record} onClose={()=>setPrinting(false)} onSettings={()=>{setPrinting(false);returnToPrint.current=true;router.push('/printer-settings' as any);}}/>
 </SafeAreaView>;
}
