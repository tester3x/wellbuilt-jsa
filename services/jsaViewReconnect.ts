/** Refresh cached views on a real connection recovery, without polling. */
export function subscribeJsaViewReconnect(refresh:()=>void):()=>void {
 const native=require('../modules/wellbuilt-platform');
 let live=true,revision=0,online:boolean|null=null;
 const apply=(state:{reachable?:boolean},event:boolean)=>{
  if(!live)return;
  const next=state.reachable===true;
  const recovered=next&&(online===false||event&&online===null);
  online=next;if(recovered)refresh();
 };
 const sub=native?.addListener?.('connectionChanged',(state:{reachable?:boolean})=>{++revision;apply(state,true);});
 const captured=revision;
 void native?.connectionState?.().then((state:{reachable?:boolean})=>{if(revision===captured)apply(state,false);}).catch(()=>{});
 return()=>{live=false;sub?.remove();};
}
