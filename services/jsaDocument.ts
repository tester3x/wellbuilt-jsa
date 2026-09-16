import {selectedAssessmentLabels} from './jsaAssessmentLabels';
import {JSA_STEPS,PPE_ITEMS,PREPARED_FOR_WORK_ITEMS} from '../constants/jsaTemplate';
const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function signingTime(value:unknown):string {
 const date=new Date(value as string|number);
 return value!=null&&!Number.isNaN(date.getTime())?date.toLocaleString('en-US',{timeZoneName:'short'}):'Not recorded';
}
export function recordCustomer(r:any):string{
  return r.operator || [...new Set((r.wells || []).map((w:any)=>w.operator).filter(Boolean))].join(', ') || 'Customer not recorded';
}
/** Read/print is a projection only. It never signs, closes, or edits a record. */
export function jsaDocumentHtml(r:any,width?:3|4):string{
 const steps=Array.isArray(r.assessmentSteps)&&r.assessmentSteps.length?r.assessmentSteps:JSA_STEPS;
 const archived=Array.isArray(r.assessmentSteps)&&r.assessmentSteps.length>0;
 let ppe=r.ppeSelected || {};if(typeof ppe==='string'){try{ppe=JSON.parse(ppe);}catch{ppe={};}}ppe=ppe.selected || ppe;
 const selected=(map:any,labels:{id:string;label:string}[])=>selectedAssessmentLabels(map,labels).map(escape).join(', ');
 const signature=String(r.signatureImage||'');const image=/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(signature)?signature:/^[A-Za-z0-9+/=\s]+$/.test(signature)&&signature?`data:image/png;base64,${signature}`:'';
 const locations=[...(r.wells||[]).map((w:any)=>typeof w==='string'?{name:w,jobType:r.jobActivityName}:w),...(r.locations||[]).filter((n:string)=>!(r.wells||[]).some((w:any)=>w.name===n)).map((name:string)=>({name,jobType:r.jobActivityName}))];
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 @page{size:${width?`${width}in 11in`:'letter'};margin:${width?'8px':'24px'}}
 body{font-family:Arial,sans-serif;color:#000;margin:0;padding:8px;font-size:${width?'13':'12'}px;font-weight:${width?'600':'400'};line-height:1.35;overflow-wrap:anywhere}
 h1{font-size:20px}h2{font-size:16px;margin:14px 0 5px}h3{font-size:14px;margin:9px 0 3px}h2,h3{break-after:avoid;page-break-after:avoid}.signature{break-inside:avoid;page-break-inside:avoid}.row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #aaa;padding:4px 0}.item{break-inside:avoid;margin:5px 0}img{max-width:100%;width:240px;height:70px;object-fit:contain}.signature img{filter:brightness(0)}.note{border:1px solid;padding:7px}.footer{margin-top:15px;border-top:1px solid;padding-top:6px}
 </style></head><body><h1>WellBuilt · Job Safety Analysis</h1>
 <div>${escape(recordCustomer(r))}</div><div>${escape(r.driverName)} · Truck ${escape(r.truckNumber)} · ${escape(r.date)}</div>
 <h2>Location / Activity</h2>${locations.map((w:any)=>`<div class="row"><span>${escape(w.name)}</span><span>${escape(w.jobType||r.jobActivityName)}</span></div>`).join('')}
 ${(r.assessmentTemplates||[]).length?`<h2>Company assessments</h2>${r.assessmentTemplates.map((t:any)=>`<div>${escape(t.name)} · Version ${escape(t.version)}</div>`).join('')}`:''}
 <h2>Steps, hazards and controls</h2>${!archived?'<p class="note">Reference only: the original step text was not stored with this older JSA. The steps below are the current built-in reference, not proof of what was originally read.</p>':''}
 ${steps.map((s:any)=>`<h3>${escape(s.title)}</h3>${(s.items||[]).map((i:any)=>`<div class="item"><b>Hazard:</b> ${escape(i.hazard)}<br><b>Controls:</b> ${escape(i.controls)}</div>`).join('')}`).join('')}
 <h2>PPE selected</h2><div>${selected(ppe,r.assessmentPpeItems||PPE_ITEMS)}${(r.ppeOtherItems||[]).map((x:string)=>`, ${escape(x)}`).join('')}</div>
 <h2>Prepared for work</h2><div>${selected(r.prepared,r.assessmentPreparedItems||PREPARED_FOR_WORK_ITEMS)}</div><h2>Notes</h2><div>${escape(r.notes||'—')}</div>
 <section class="signature"><h2>Original signature</h2>${image?`<img src="${image}" alt="Driver signature">`:'<div>Signature image unavailable in this saved record.</div>'}<div>${escape(r.driverLegalName||r.signature||r.driverName)}</div><div>Signed: ${escape(signingTime(r.timestamp||r.createdAt))}</div></section>
 ${(r.additions||[]).map((a:any)=>`<h2>Added location / activity</h2><div>${escape(a.location)} · ${escape(a.activity)}</div><div>Hazards: ${escape(a.hazards)}</div><div>Controls: ${escape(a.controls)}</div><div>PPE: ${escape(a.ppe)}</div><div>${escape(a.acknowledgement||'Location and activity reviewed and acknowledged.')}</div><div>${escape(r.driverLegalName||r.signature||r.driverName)} · ${escape(signingTime(a.acknowledgedAtMs))}</div>${a.taskAssessment?`<h3>Additional task assessment</h3>${(a.taskAssessment.templates||[]).map((t:any)=>`<div>${escape(t.name)} · Version ${escape(t.version)}</div>`).join('')}${(a.taskAssessment.steps||[]).map((s:any)=>`<h3>${escape(s.title)}</h3>${(s.items||[]).map((i:any)=>`<div><b>Hazard:</b> ${escape(i.hazard)}<br><b>Controls:</b> ${escape(i.controls)}</div>`).join('')}`).join('')}<div>PPE: ${(a.taskAssessment.ppeItems||[]).map((p:any)=>escape(p.label)).join(', ')}</div><div>Preparation: ${(a.taskAssessment.preparedItems||[]).map((p:any)=>escape(p.label)).join(', ')}</div>`:''}`).join('')}
 <div class="footer">WellBuilt JSA · Record ${escape(r.id)} · Original signature and later acknowledgements remain separate.</div></body></html>`;
}
