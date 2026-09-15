import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';
import {loadLaunchContext} from './sso/jsaRuntime';

const routes=new Set(['/','/(tabs)','/history','/(tabs)/history','/open-jsas','/jsa-record','/viewJsa','/add-location','/settings','/printer-settings','/steps','/ppe','/signoff']);
const forbidden=/token|code|secret|signature|password|requestId|returnTo/i;
const key=(s:{uid:string;companyId:string})=>`jsa.screen.v1:${s.uid}:${s.companyId}`;
export function resumeScreen(pathname:string,params:Record<string,unknown>){
 if(!routes.has(pathname))return null;
 const safe:Record<string,string>={};
 for(const [name,value] of Object.entries(params))if(!forbidden.test(name)&&typeof value==='string'&&value.length<100000)safe[name]=value;
 delete safe.welcomeReadRequestId;delete safe.newStandalone;
 return {pathname:pathname==='/'?'/(tabs)':pathname,params:safe};
}
export async function rememberJsaScreen(pathname:string,params:Record<string,unknown>){
 const screen=resumeScreen(pathname,params);if(!screen)return;
 const owner=await loadUsableGovernedSession();if(!owner||await loadLaunchContext())return;
 const current=await loadUsableGovernedSession();if(!current||current.uid!==owner.uid||current.generation!==owner.generation||current.companyId!==owner.companyId)return;
 await AsyncStorage.setItem(key(owner),JSON.stringify(screen));
}
export async function lastJsaScreen(){
 const owner=await loadUsableGovernedSession();if(!owner||await loadLaunchContext())return null;
 let screen=null;try{const raw=JSON.parse(await AsyncStorage.getItem(key(owner))||'null');if(raw)screen=resumeScreen(raw.pathname,raw.params||{});}catch{}
 const current=await loadUsableGovernedSession();
 if(!current||current.uid!==owner.uid||current.companyId!==owner.companyId||current.generation!==owner.generation||await loadLaunchContext())return null;
 return screen;
}
