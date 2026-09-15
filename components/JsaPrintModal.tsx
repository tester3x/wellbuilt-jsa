import React,{useEffect,useRef,useState} from 'react';
import {Modal,View,Text,Pressable,ActivityIndicator,Alert} from 'react-native';
import * as Print from 'expo-print';
import {refreshPrinter,printThermal,PrinterSettings,samePrinterSelection} from '../services/thermalPrinter';
import {jsaDocumentHtml} from '../services/jsaDocument';
export default function JsaPrintModal({visible,record,onClose,onSettings}:{visible:boolean;record:any;onClose:()=>void;onSettings:()=>void}){
 const [printer,setPrinter]=useState<PrinterSettings|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');const lock=useRef(false);
 useEffect(()=>{let active=true;if(visible){setStatus('');refreshPrinter().then(r=>{if(active)setPrinter(r.printer);}).catch(()=>{if(active)setStatus('Open Printer settings to choose a printer.');});}return()=>{active=false;};},[visible]);
 const run=async(thermal:boolean)=>{if(lock.current)return;lock.current=true;setBusy(true);setStatus(thermal?'Checking thermal printer…':'Opening regular printer…');let setup=false;try{
  if(thermal){const current=await refreshPrinter(true);setPrinter(current.printer);if(!current.printer.macAddress){setup=true;return;}
   if(!samePrinterSelection(printer,current.printer)){
    setStatus(`Printer selection changed to ${current.printer.name || 'a different printer'}. Nothing was sent. Check the selection, then tap Thermal printer again.`);
    return;
   }
   setStatus('Preparing thermal report…');
   const width=current.printer.width;const pdf=await Print.printToFileAsync({html:jsaDocumentHtml(record,width),width:width*72,height:792});
   await printThermal(current.printer,pdf.uri,(p,n)=>setStatus(`Printing ${p} of ${n}…`));setStatus('Sent to printer. Check the full printed copy.');
  }else{await Print.printAsync({html:jsaDocumentHtml(record)});setStatus('Print dialog closed. Check your printer.');}
 }catch(e){const message=e instanceof Error?e.message:String(e);setStatus(message);Alert.alert('Printing did not complete',message);}finally{lock.current=false;setBusy(false);if(setup)onSettings();}};
 const button=(title:string,action:()=>void)=><Pressable disabled={busy} onPress={action} style={{padding:14,backgroundColor:'#DAA520',borderRadius:10}}><Text style={{fontWeight:'700',color:'white',textAlign:'center'}}>{title}</Text></Pressable>;
 return <Modal visible={visible} transparent onRequestClose={()=>{if(!lock.current)onClose();}}><View style={{flex:1,backgroundColor:'#0008',justifyContent:'center',padding:24}}><View style={{backgroundColor:'white',padding:20,borderRadius:16,gap:14}}><Text style={{fontSize:22,fontWeight:'700'}}>Print JSA</Text><Text>{printer?.name||'No thermal printer selected'}{printer?.name?` · ${printer.width}″`:''}</Text>{button('Thermal printer',()=>void run(true))}{button('Regular printer',()=>void run(false))}{button('Printer settings',onSettings)}{busy&&<ActivityIndicator/>}<Text accessibilityLiveRegion="polite">{status}</Text>{button('Close',onClose)}</View></View></Modal>;
}
