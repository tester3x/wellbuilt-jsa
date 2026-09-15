const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict');
let saved=null,devices=[],calls=[],allowed=true;
const native={BrotherPrinter:{getBondedDevices:async()=>devices,getPDFPageCount:async()=>2,printPDF:async(...a)=>calls.push(['brother',...a])},EscPosPrinter:{printPDF:async(...a)=>calls.push(['escpos',...a])}};
const api={};new Function('require','exports',ts.transpileModule(fs.readFileSync('services/thermalPrinter.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText)(name=>{
 if(name.includes('async-storage'))return {getItem:async()=>saved,setItem:async(_,v)=>{saved=v}};
 if(name==='react-native')return {NativeModules:native,Platform:{OS:'android',Version:35},PermissionsAndroid:{PERMISSIONS:{BLUETOOTH_CONNECT:'connect',BLUETOOTH_SCAN:'scan'},RESULTS:{GRANTED:'granted'},check:async()=>allowed,requestMultiple:async()=>({connect:allowed?'granted':'denied',scan:allowed?'granted':'denied'})}};
 throw Error(name);
},api);
(async()=>{
 const home={brand:'brother',width:4,macAddress:'home',name:'Home'},truck={...home,macAddress:'truck',name:'Truck'};
 devices=[{macAddress:'home'},{macAddress:'truck'}];await api.savePrinter(home);
 assert.equal((await api.refreshPrinter(true)).printer.macAddress,'home');
 await api.savePrinter(truck);assert.equal((await api.refreshPrinter(true)).printer.macAddress,'truck');
 devices=[{macAddress:'truck'}];assert.equal((await api.refreshPrinter(true)).printer.macAddress,'truck');
 await api.savePrinter(home);assert.equal((await api.refreshPrinter(true)).missing,true);assert.equal((await api.loadPrinter()).macAddress,undefined);
 calls=[];await assert.rejects(()=>api.printThermal(home,'file',()=>{}),/no longer paired/);assert.equal(calls.length,0);
 await api.printThermal(truck,'file',()=>{});assert.deepEqual(calls,[['brother','truck','file',4,-1]]);
 calls=[];await api.printThermal({...truck,brand:'generic'},'file',()=>{});assert.equal(calls.length,2);
 allowed=false;await assert.rejects(()=>api.refreshPrinter(true),/Nearby devices/);
 console.log('PASS: two paired printers, selection switch, stale pairing, no send to missing device, complete Brother job, ESC/POS pages and permission feedback');
})().catch(e=>{console.error(e);process.exitCode=1});
