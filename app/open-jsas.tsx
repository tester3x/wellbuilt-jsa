import React,{useCallback,useState} from 'react';
import {Alert,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {Stack,useFocusEffect,useRouter} from 'expo-router';
import BottomActionBar from '../components/BottomActionBar';
import MoreMenu from '../components/MoreMenu';
import {Ionicons} from '@expo/vector-icons';
import {closeShiftJsaOrphan,discardUnsignedJsaOrphan,ownOpenJsaRecords} from '../services/jsaRecord';
import {recordCustomer} from '../services/jsaDocument';
import {closeStandaloneJsa,syncStandaloneHistory} from '../services/standaloneJsa';
import {useLanguage} from './contexts/LanguageContext';
import {useTheme} from './contexts/ThemeContext';
import {colors} from '../constants/colors';
export default function OpenJsas(){const router=useRouter(),{t}=useLanguage(),{setBackgroundPackageId,resolveBackgroundPackageForJob}=useTheme(),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  setLoading(true);setError('');let refreshFailed=false;
  try{await syncStandaloneHistory();}catch{refreshFailed=true;}
  try{
   const result=await ownOpenJsaRecords();setRows(result.rows);
   setError(refreshFailed?'Could not refresh JSAs. Showing records available on this phone. Retry when connected.':result.unverified?'Some shift statuses could not be verified. Saved JSAs remain available.':'');
  }catch{setRows([]);setError('Could not load your JSAs. Check your sign-in and retry.');}
  finally{setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const close=async(items:any[])=>{if(busy)return;setBusy(true);try{for(const item of items)await closeStandaloneJsa(item);}catch{setError('Some JSAs could not close. The remaining open records are shown below.');}finally{await load();setBusy(false);}};
 const handleCloseOrphan=async(item:any)=>{if(busy)return;setBusy(true);try{await closeShiftJsaOrphan(item);}catch(err:any){setError(err?.message||'Could not close prior-day JSA.');}finally{await load();setBusy(false);}};
 const handleDiscardOrphan=async(item:any)=>{if(busy)return;setBusy(true);try{await discardUnsignedJsaOrphan(item,'discarded_by_driver');}catch(err:any){setError(err?.message||'Could not discard JSA.');}finally{await load();setBusy(false);}};
 const independent=rows.filter(r=>r.workflow==='standalone');
 return <View style={{flex:1}}><ScrollView style={{flex:1}} contentContainerStyle={{padding:20,gap:15}}><Stack.Screen options={{title:t('Open JSAs'),headerRight:()=>null}}/>{!!error&&<Text>{t(error)}</Text>}
 {rows.map(r=><View key={r.id} style={{backgroundColor:colors.glassSurface,padding:18,borderRadius:12,gap:8}}><TouchableOpacity onPress={()=>{setBackgroundPackageId(resolveBackgroundPackageForJob(r.packageId||r.jobActivityName||''));router.push({pathname:'/jsa-record',params:{id:r.id}} as any);}}><Text style={{fontSize:20,fontWeight:'700'}}>{recordCustomer(r)}</Text><Text>{r.date} · {r.jobActivityName}</Text><Text>{t(r.workflow==='standalone'?'Standalone':r.isPriorDayOrphan?'Prior-day shift JSA':'Shift JSA')} · {t(r.isPriorDayOrphan && r.isSigned ? 'Signed' : 'Open')}</Text></TouchableOpacity>{r.workflow==='standalone'&&<TouchableOpacity disabled={busy} onPress={()=>Alert.alert(t('Close JSA?'),t('The signed report and its additions stay available.'),[{text:t('Cancel'),style:'cancel'},{text:t('Close JSA'),onPress:()=>void close([r])}])}><Text>{t('Close this JSA')}</Text></TouchableOpacity>}{r.isPriorDayOrphan&&r.canCloseOrphan&&<TouchableOpacity disabled={busy} onPress={()=>Alert.alert(t('Close prior-day JSA?'),t('The signed report stays available.'),[{text:t('Cancel'),style:'cancel'},{text:t('Close JSA'),onPress:()=>void handleCloseOrphan(r)}])}><Text>{t('Close this JSA')}</Text></TouchableOpacity>}{r.isPriorDayOrphan&&!r.isSigned&&(r.canFinish||r.canDiscard)&&<View style={{flexDirection:'row',gap:16}}>{r.canFinish&&<TouchableOpacity onPress={()=>{setBackgroundPackageId(resolveBackgroundPackageForJob(r.packageId||r.jobActivityName||''));router.push({pathname:'/jsa-record',params:{id:r.id}} as any);}}><Text style={{fontWeight:'600'}}>{t('Finish')}</Text></TouchableOpacity>}{r.canDiscard&&<TouchableOpacity disabled={busy} onPress={()=>Alert.alert(t('Discard draft?'),t('Discard this unsigned prior-day draft?'),[{text:t('Cancel'),style:'cancel'},{text:t('Discard'),style:'destructive',onPress:()=>void handleDiscardOrphan(r)}])}><Text style={{color:'#D9534F'}}>{t('Discard')}</Text></TouchableOpacity>}</View>}</View>)}
 {loading&&<Text>{t('Checking open JSAs…')}</Text>}
 {!loading&&!error&&!rows.length&&<Text>{t('No open JSAs.')}</Text>}
 {!!error&&<TouchableOpacity disabled={loading} onPress={()=>void load()}><Text>{t('Retry loading JSAs')}</Text></TouchableOpacity>}
 <TouchableOpacity onPress={()=>router.push({pathname:'/(tabs)',params:{newStandalone:String(Date.now())}} as any)} style={{padding:18,backgroundColor:'#DAA520',borderRadius:12}}><Text style={{color:'white',fontWeight:'700'}}>＋ {t('New JSA / another oil company')}</Text></TouchableOpacity>
 {!!independent.length&&<TouchableOpacity disabled={busy} onPress={()=>Alert.alert(t('End standalone day?'),t('Close these {count} standalone JSAs? Shift JSAs are handled through Suite.',{count:independent.length}),[{text:t('Cancel'),style:'cancel'},{text:t('Close standalone JSAs'),onPress:()=>void close(independent)}])}><Text>{t(busy?'Closing…':'End standalone day')}</Text></TouchableOpacity>}
 </ScrollView><BottomActionBar><TouchableOpacity accessibilityRole="button" style={{width:88,minHeight:52,alignItems:"center",justifyContent:"center"}} onPress={()=>router.push("/(tabs)/history" as any)}><Ionicons name="time-outline" size={25}/><Text style={{fontSize:12}}>{t('Saved JSAs')}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" style={{width:88,minHeight:52,alignItems:"center",justifyContent:"center"}} onPress={()=>router.push("/(tabs)" as any)}><Ionicons name="add-circle-outline" size={25} color="#DAA520"/><Text style={{fontSize:12}}>{t('New JSA')}</Text></TouchableOpacity><MoreMenu placement="bottom"/></BottomActionBar></View>;
}

