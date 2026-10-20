import {subscribeJsaViewReconnect} from '../services/jsaViewReconnect';
import React,{useCallback,useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,Text,View} from 'react-native';
import {Stack,useFocusEffect,useRouter} from 'expo-router';
import {WebView} from 'react-native-webview';
import {Ionicons} from '@expo/vector-icons';
import {loadJsaHome,readCachedJsaHome,type JsaHomeState} from '../services/jsaHome';
import {useJsaHome} from './contexts/JsaHomeContext';
import {useLanguage} from './contexts/LanguageContext';
import {useAuth} from './contexts/AuthContext';
import {jsaDocumentHtml} from '../services/jsaDocument';
import BottomActionBar from '../components/BottomActionBar';
import MoreMenu from '../components/MoreMenu';
import BackToTickets from '../components/BackToTickets';
export default function CurrentJsa(){
 const router=useRouter(),home=useJsaHome(),{t,lang}=useLanguage();
 const {session}=useAuth(),ownerKey=`${session?.uid}:${session?.generation}:${session?.companyId}:${session?.driverId}`;
 const [value,setValue]=useState<JsaHomeState|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useFocusEffect(useCallback(()=>{let active=true;setValue(null);setError('');void readCachedJsaHome('read').then(cached=>{if(active&&cached)setValue(cached);return loadJsaHome('read');}).then(v=>{if(active)setValue(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[retry,ownerKey]));
 useEffect(()=>subscribeJsaViewReconnect(()=>setRetry(n=>n+1)),[]);
 const current=value?.companyId===session?.companyId&&value?.driverId===session?.driverId?value:null;
 return <View style={{flex:1}}><Stack.Screen options={{title:t('Current JSA'),headerRight:()=>null}}/>
  {!current&&!error?<ActivityIndicator style={{margin:24}}/>:error?<View style={{padding:20}}><Text>{t(error)}</Text><Pressable onPress={()=>setRetry(n=>n+1)} style={{paddingVertical:16}}><Text>{t('Retry JSA check')}</Text></Pressable></View>:current?.action==='resume'&&current.record?<>
   {current.active?.kind==='standalone'&&<Pressable onPress={()=>router.push({pathname:'/add-location',params:{id:current.active!.id}} as any)} style={{padding:14,flexDirection:'row',gap:8}}><Ionicons name="add-circle-outline" size={22}/><Text>{t('Add location / activity')}</Text></Pressable>}
   {current.offline&&<Text style={{padding:12}}>{t('Saved on this device')} · {new Date(current.cachedAtMs!).toLocaleString()}</Text>}
   <WebView source={{html:jsaDocumentHtml(current.record,undefined,{t,locale:lang==='es'?'es-MX':'en-US'})}} javaScriptEnabled={false} style={{flex:1}}/>
  </>:<View style={{padding:20}}><Text>{t('There is no open JSA for your current shift.')}</Text></View>}
  <BottomActionBar>
   <BackToTickets/>
   <Pressable onPress={()=>{void home.refresh(true);router.replace('/(tabs)' as any);}} style={{width:88,minHeight:52,alignItems:'center',justifyContent:'center'}}><Ionicons name="home-outline" size={26}/><Text>{t('JSA home')}</Text></Pressable>
   <MoreMenu placement="bottom"/>
  </BottomActionBar>
 </View>;
}
