import {selectedAssessmentLabels} from './jsaAssessmentLabels';
import {JSA_STEPS,PPE_ITEMS,PREPARED_FOR_WORK_ITEMS} from '../constants/jsaTemplate';
import {additionHasDifferences,resolveLocationLayout,type LocationsCoveredPlacement,type LocationDifferencesPlacement} from './jsaLocationLayout';

const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Translator=(text:string,values?:Record<string,string|number>)=>string;
type DocumentLocale={t?:Translator;locale?:string};
const identity:Translator=(text,values)=>values?text.replace(/\{(\w+)\}/g,(match,key)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]):match):text;
export function signingTime(value:unknown,locale='en-US',notRecorded='Not recorded'):string {
 const date=new Date(value as string|number);
 return value!=null&&!Number.isNaN(date.getTime())?date.toLocaleString(locale,{timeZoneName:'short'}):notRecorded;
}
export function recordCustomer(r:any,t:Translator=identity):string{
  return r.operator || [...new Set((r.wells || []).map((w:any)=>w.operator).filter(Boolean))].join(', ') || t('Customer not recorded');
}

function locationSections(r:any,t:Translator,locale:string){
 const additions=Array.isArray(r.additions)?r.additions:[];
 const seen=new Set<string>();
 const originals:any[]=[];
 const addOriginal=(name:unknown,activity:unknown)=>{
   const clean=String(name||'').trim();if(!clean||seen.has(clean.toLowerCase()))return;
   seen.add(clean.toLowerCase());originals.push({location:clean,activity:String(activity||r.jobActivityName||'').trim()});
 };
 (r.wells||[]).forEach((w:any)=>typeof w==='string'?addOriginal(w,r.jobActivityName):addOriginal(w?.name,w?.jobType));
 (r.locations||[]).forEach((name:string)=>addOriginal(name,r.jobActivityName));
 if(!originals.length)addOriginal(r.wellName,r.jobActivityName);
 const signedAt=signingTime(r.timestamp||r.createdAt,locale,t('Not recorded'));
 const rows=[...originals.map(item=>({...item,meta:`${t('Original')} · ${signedAt}`,different:false})),...additions.map((a:any)=>({location:a.location,activity:a.activity,meta:`${t('Added')} · ${signingTime(a.acknowledgedAtMs,locale,t('Not recorded'))}`,different:additionHasDifferences(a)}))];
 const covered=rows.length?`<section class="location-block"><h2>${escape(t('Locations covered'))}</h2>${rows.map(row=>`<div class="location-row"><div><b>${row.different?'* ':''}${escape(row.location)}</b><span>${escape(row.activity||'—')}</span></div><small>${escape(row.meta)}</small></div>`).join('')}${additions.length?`<p class="location-note">${escape(t('Added locations without an * were acknowledged under the same company assessment. Location-specific differences are listed separately.'))}</p>`:''}</section>`:'';
 const changed=additions.filter(additionHasDifferences);
 const differences=changed.length?`<section class="location-block"><h2>${escape(t('Location-specific differences'))}</h2>${changed.map((a:any)=>`<div class="difference"><h3>* ${escape(a.location)} · ${escape(a.activity)}</h3>${a.conditionsDiffer===true||a.conditionsDiffer===undefined?`<div><b>${escape(t('Additional hazards:'))}</b> ${escape(a.hazards)}</div><div><b>${escape(t('Additional controls:'))}</b> ${escape(a.controls)}</div>${a.ppe?`<div><b>${escape(t('PPE changes:'))}</b> ${escape(a.ppe)}</div>`:''}`:''}${a.taskAssessment?`<h3>${escape(t('Additional task assessment'))}</h3>${(a.taskAssessment.templates||[]).map((template:any)=>`<div>${escape(template.name)} · ${escape(t('Version'))} ${escape(template.version)}</div>`).join('')}${(a.taskAssessment.steps||[]).map((s:any)=>`<h3>${escape(t(s.title))}</h3>${(s.items||[]).map((i:any)=>`<div class="item"><b>${escape(t('Hazard:'))}</b> ${escape(t(i.hazard))}<br><b>${escape(t('Controls:'))}</b> ${escape(t(i.controls))}</div>`).join('')}`).join('')}${(a.taskAssessment.ppeItems||[]).length?`<div><b>${escape(t('PPE:'))}</b> ${(a.taskAssessment.ppeItems||[]).map((p:any)=>escape(t(p.label))).join(', ')}</div>`:''}${(a.taskAssessment.preparedItems||[]).length?`<div><b>${escape(t('Preparation:'))}</b> ${(a.taskAssessment.preparedItems||[]).map((p:any)=>escape(t(p.label))).join(', ')}</div>`:''}`:''}<small>${escape(t('Acknowledged'))} ${escape(signingTime(a.acknowledgedAtMs,locale,t('Not recorded')))}</small></div>`).join('')}</section>`:'';
 return {covered,differences};
}

/** Read/print is a projection only. It never signs, closes, or edits a record. */
export function jsaDocumentHtml(r:any,width?:3|4,options:DocumentLocale={}):string{
 const t=options.t||identity;const locale=options.locale||'en-US';
 const steps=Array.isArray(r.assessmentSteps)&&r.assessmentSteps.length?r.assessmentSteps:JSA_STEPS;
 const archived=Array.isArray(r.assessmentSteps)&&r.assessmentSteps.length>0;
 let ppe=r.ppeSelected || {};if(typeof ppe==='string'){try{ppe=JSON.parse(ppe);}catch{ppe={};}}ppe=ppe.selected || ppe;
 const signature=String(r.signatureImage||'');const image=/^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(signature)?signature:/^[A-Za-z0-9+/=\s]+$/.test(signature)&&signature?`data:image/png;base64,${signature}`:'';
 const layout=resolveLocationLayout(r.locationLayout);
 const blocks=locationSections(r,t,locale);
 const slot=(placement:LocationsCoveredPlacement|LocationDifferencesPlacement)=>`${layout.locationsCoveredPlacement===placement?blocks.covered:''}${layout.locationDifferencesPlacement===placement?blocks.differences:''}`;
 return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
 @page{size:${width?`${width}in 11in`:'letter'};margin:${width?'8px':'24px'}}
 body{font-family:Arial,sans-serif;color:#000;margin:0;padding:8px;font-size:${width?'13':'12'}px;font-weight:${width?'600':'400'};line-height:1.35;overflow-wrap:anywhere}
 h1{font-size:20px}h2{font-size:16px;margin:14px 0 5px}h3{font-size:14px;margin:9px 0 3px}h2,h3{break-after:avoid;page-break-after:avoid}.signature,.location-row,.difference{break-inside:avoid;page-break-inside:avoid}.item{break-inside:avoid;margin:5px 0}img{max-width:100%;width:240px;height:70px;object-fit:contain}.signature img{filter:brightness(0)}.note{border:1px solid;padding:7px}.footer{margin-top:15px;border-top:1px solid;padding-top:6px}.location-block{margin-top:10px}.location-row{border-bottom:1px solid #bbb;padding:5px 0}.location-row div{display:flex;justify-content:space-between;gap:10px}.location-row small,.difference small{display:block;color:#555;font-size:10px}.location-note{font-size:10px;color:#444}.difference{border-left:3px solid #555;padding-left:8px;margin:8px 0}
 </style></head><body><h1>WellBuilt · ${escape(t('Job Safety Analysis'))}</h1>
 <div>${escape(recordCustomer(r,t))}</div><div>${escape(r.driverName)} · ${escape(t('Truck'))} ${escape(r.truckNumber)} · ${escape(r.date)}</div>
 ${slot('after-job-details')}
 ${(r.assessmentTemplates||[]).length?`<h2>${escape(t('Company assessments'))}</h2>${r.assessmentTemplates.map((template:any)=>`<div>${escape(template.name)} · ${escape(t('Version'))} ${escape(template.version)}</div>`).join('')}`:''}
 <h2>${escape(t('Steps, hazards and controls'))}</h2>${!archived?`<p class="note">${escape(t('Reference only: the original step text was not stored with this older JSA. The steps below are the current built-in reference, not proof of what was originally read.'))}</p>`:''}
 ${steps.map((s:any)=>`<h3>${escape(t(s.title))}</h3>${(s.items||[]).map((i:any)=>`<div class="item"><b>${escape(t('Hazard:'))}</b> ${escape(t(i.hazard))}<br><b>${escape(t('Controls:'))}</b> ${escape(t(i.controls))}</div>`).join('')}`).join('')}
 ${slot('after-assessment')}
 <h2>${escape(t('PPE selected'))}</h2><div>${selectedAssessmentLabels(ppe,r.assessmentPpeItems||PPE_ITEMS).map((label:string)=>escape(t(label))).join(', ')}${(r.ppeOtherItems||[]).map((x:string)=>`, ${escape(x)}`).join('')}</div>
 <h2>${escape(t('Prepared for work'))}</h2><div>${selectedAssessmentLabels(r.prepared,r.assessmentPreparedItems||PREPARED_FOR_WORK_ITEMS).map((label:string)=>escape(t(label))).join(', ')}</div><h2>${escape(t('Notes'))}</h2><div>${escape(r.notes||'—')}</div>
 <section class="signature"><h2>${escape(t('Original signature'))}</h2>${image?`<img src="${image}" alt="${escape(t('Driver signature'))}">`:`<div>${escape(t('Signature image unavailable in this saved record.'))}</div>`}<div>${escape(r.driverLegalName||r.signature||r.driverName)}</div><div>${escape(t('Signed:'))} ${escape(signingTime(r.timestamp||r.createdAt,locale,t('Not recorded')))}</div></section>
 ${slot('after-signature')}
 <div class="footer">WellBuilt JSA · ${escape(t('Record'))} ${escape(r.id)} · ${escape(t('Original signature and later acknowledgements remain separate.'))}</div></body></html>`;
}
