import {subscribeJsaViewReconnect} from '../../services/jsaViewReconnect';
import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {useAuth} from './AuthContext';
import {loadJsaHome,readCachedJsaHome,type JsaHomeState} from '../../services/jsaHome';
type Value={state:JsaHomeState|null;checking:boolean;error:string;refresh(force?:boolean):Promise<void>};
const Context=createContext<Value|null>(null);
export function JsaHomeProvider({children}:{children:React.ReactNode}){
 const {session}=useAuth(),key=session?`${session.uid}:${session.generation}:${session.companyId}:${session.driverId}`:'';
 const owner=useRef(key);owner.current=key;
 const sequence=useRef(0),flight=useRef<{key:string;promise:Promise<void>}|null>(null),last=useRef({key:'',at:0});
 const [value,setValue]=useState<{key:string;state:JsaHomeState|null;checking:boolean;error:string}>({key:'',state:null,checking:true,error:''});
 const refresh=useCallback((force=false)=>{
  if(!key)return Promise.resolve();
  if(flight.current?.key===key)return flight.current.promise;
  if(!force&&last.current.key===key&&Date.now()-last.current.at<5000)return Promise.resolve();
  const seq=++sequence.current;setValue({key,state:null,checking:true,error:''});
  const promise=readCachedJsaHome().then(cached=>{if(cached&&owner.current===key&&sequence.current===seq)setValue({key,state:cached,checking:false,error:''});return loadJsaHome();}).then(state=>{if(owner.current===key&&sequence.current===seq){last.current={key,at:Date.now()};setValue({key,state,checking:false,error:''});}})
   .catch(e=>{if(owner.current===key&&sequence.current===seq)setValue({key,state:null,checking:false,error:e instanceof Error?e.message:'Could not verify JSA status.'});})
   .finally(()=>{if(flight.current?.promise===promise)flight.current=null;});
  flight.current={key,promise};return promise;
 },[key]);
 useEffect(()=>{void refresh();const sub=AppState.addEventListener('change',s=>{if(s==='active')void refresh(true);});const reconnect=subscribeJsaViewReconnect(()=>void refresh(true));return()=>{reconnect();sub.remove();++sequence.current;flight.current=null;last.current={key:'',at:0};};},[refresh]);
 const current=value.key===key?value:{state:null,checking:true,error:''};
 return <Context.Provider value={{state:current.state,checking:current.checking,error:current.error,refresh}}>{children}</Context.Provider>;
}
export function useJsaHome(){const context=useContext(Context);if(!context)throw Error('JSA home provider missing');return context;}
