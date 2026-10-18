import { NativeModules } from 'react-native';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as Crypto from 'expo-crypto';
import { loadUsableGovernedSession, currentGovernedIdentityEpoch } from './sso/jsaGovernedAuthLive';
import { jsaDocumentHtml } from './jsaDocument';
import { standaloneReportHtml } from './standaloneJsa';

export function clearTicketTimeForms(): number { return NativeModules.JsaWorkForms?.clearWorkForms?.() ?? -1; }
const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Uses the existing governed JSA identity; never creates a request or completes a JSA. */
export async function refreshTicketTimeForms(period: {startDate:string;endDate:string}): Promise<void> {
  const bridge=NativeModules.JsaWorkForms;
  if(!bridge)return;
  const revision=clearTicketTimeForms(),epoch=currentGovernedIdentityEpoch();
  try{
    const session=await loadUsableGovernedSession();
    if(!session) return;
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;
    const call=httpsCallable(getFunctions(getApp()),'jsaWeeklyForms',{timeout:45000});
    const result=await call({...period,timezone});const p=result.data as any;
    if(p?.driverId!==session.driverId||p?.companyId!==session.companyId||p?.startDate!==period.startDate||p?.endDate!==period.endDate||!Array.isArray(p.records))throw new Error('scope');
    const forms=[];
    for(const r of p.records){
      let html:string;
      if(r.source==='standalone')html=await standaloneReportHtml(r.record);
      else if(r.kind==='jsa_ack')html=`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:letter;margin:30pt}body{font:14px Arial;line-height:1.5}img{width:240px;max-width:100%}</style></head><body><h1>WellBuilt JSA · Job acknowledgement</h1><p>${escape(session.legalName||session.displayName)} · ${escape(r.date)}</p><p>Job: ${escape(r.jobRef)}<br>Shift: ${escape(r.shiftId)}<br>Recorded: ${escape(r.completedAt)}</p><p>Method: ${escape(r.source==='job_acknowledgment'?'Job acknowledgement recorded by WB T':'Signed acknowledgement recorded by WB JSA')}</p>${/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.record?.signatureImage||'')?`<img alt="Signature" src="${r.record.signatureImage}">`:''}<p>Record ${escape(r.id)}. This is a job acknowledgement, not a replacement for the full JSA.</p></body></html>`;
      else html=jsaDocumentHtml(r.record);
      if(r.kind==='jsa_ack'&&r.fullReadId)html=html.replace('</body>',`<p>Full JSA reference: ${escape(r.fullReadId)}</p></body>`);
      forms.push({id:r.id,kind:r.kind,date:r.date,completedAt:r.completedAt,shiftId:r.shiftId,jobRef:r.jobRef,fullReadId:r.fullReadId||null,html,digest:await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,html)});
    }
    const again=await loadUsableGovernedSession();
    if(!again||again.generation!==session.generation||again.uid!==session.uid||again.companyId!==session.companyId||again.driverId!==session.driverId||currentGovernedIdentityEpoch()!==epoch)return;
    const payload=JSON.stringify({schema:'wellbuilt.work-forms',schemaVersion:1,authVerified:true,generatedAt:new Date().toISOString(),driverId:session.driverId,companyId:session.companyId,driverName:session.displayName||session.legalName,legalName:session.legalName,timezone,...period,forms,missing:p.missing||[]});
    if(!bridge.publishWorkForms(revision,Date.now()+120000,payload))console.warn('[JSA-TicketTime] export_not_published');
  }catch(error){console.warn('[JSA-TicketTime] export_failed', typeof (error as any)?.code==='string'?(error as any).code:'request_or_render');bridge.clearWorkFormsIfCurrent?.(revision);}
}
