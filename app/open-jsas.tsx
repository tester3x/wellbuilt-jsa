import React,{useCallback,useState} from 'react';
import {Alert,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {Stack,useFocusEffect,useRouter} from 'expo-router';
import {ownJsaRecords} from '../services/jsaRecord';
import {recordCustomer} from '../services/jsaDocument';
import {closeStandaloneJsa,syncStandaloneHistory} from '../services/standaloneJsa';
export default function OpenJsas(){const router=useRouter(),[rows,setRows]=useState<any[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{try{await syncStandaloneHistory();}catch{/* retain owned local records */}try{setRows((await ownJsaRecords()).filter((r:any)=>r.workflow==='standalone'&&r.state==='open'));}catch(e){setError(String(e));}},[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 const close=async(items:any[])=>{if(busy)return;setBusy(true);try{for(const item of items)await closeStandaloneJsa(item);}catch{setError('Some JSAs could not close. The remaining open records are shown below.');}finally{await load();setBusy(false);}};
 const independent=rows.filter(r=>r.workflow==='standalone');
 return <ScrollView contentContainerStyle={{padding:20,gap:15}}><Stack.Screen options={{title:'Open JSAs'}}/>{!!error&&<Text>{error}</Text>}
 {rows.map(r=><View key={r.id} style={{backgroundColor:'white',padding:18,borderRadius:12,gap:8}}><TouchableOpacity onPress={()=>router.push({pathname:'/jsa-record',params:{id:r.id}} as any)}><Text style={{fontSize:20,fontWeight:'700'}}>{recordCustomer(r)}</Text><Text>{r.date} · {r.jobActivityName}</Text><Text>{r.workflow==='standalone'?'Standalone':'Shift JSA'} · Open</Text></TouchableOpacity>{r.workflow==='standalone'&&<TouchableOpacity disabled={busy} onPress={()=>Alert.alert('Close JSA?','The signed report and its additions stay available.',[{text:'Cancel',style:'cancel'},{text:'Close JSA',onPress:()=>void close([r])}])}><Text>Close this JSA</Text></TouchableOpacity>}</View>)}
 {!rows.length&&<Text>No open JSAs.</Text>}
 <TouchableOpacity onPress={()=>router.push({pathname:'/(tabs)',params:{newStandalone:String(Date.now())}} as any)} style={{padding:18,backgroundColor:'#DAA520',borderRadius:12}}><Text style={{color:'white',fontWeight:'700'}}>＋ New JSA / another oil company</Text></TouchableOpacity>
 {!!independent.length&&<TouchableOpacity disabled={busy} onPress={()=>Alert.alert('End standalone day?',`Close these ${independent.length} standalone JSAs? Shift JSAs are handled through Suite.`,[{text:'Cancel',style:'cancel'},{text:'Close standalone JSAs',onPress:()=>void close(independent)}])}><Text>{busy?'Closing…':'End standalone day'}</Text></TouchableOpacity>}
 </ScrollView>;
}
