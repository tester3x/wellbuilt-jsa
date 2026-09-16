import {PPE_ITEMS,PREPARED_FOR_WORK_ITEMS} from '../constants/jsaTemplate';
type Label={id:string;label:string};
export function assessmentLabel(id:string,items:Label[]=[]):string{
 const known=[...items,...PPE_ITEMS,...PREPARED_FOR_WORK_ITEMS].find(x=>x.id===id)?.label;
 if(known)return known;
 const acronyms:Record<string,string>={ppe:'PPE',fr:'FR',h2s:'H2S',sds:'SDS',scba:'SCBA'};
 return id.split(/[-_]+/).map(w=>acronyms[w.toLowerCase()]||w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
}
export function selectedAssessmentLabels(selected:any,items:Label[]=[]):string[]{
 if(typeof selected==='string'){try{selected=JSON.parse(selected);}catch{return [];}}
 return Object.entries(selected?.selected||selected||{}).filter(([,v])=>v===true).map(([id])=>assessmentLabel(id,items));
}
/** Reference the archived assessment; do not invent or truncate its safety wording. */
export function locationAssessmentFields(record:any,changes?:{hazards:string;controls:string;ppe:string}){
 const selected=[...selectedAssessmentLabels(record.snapshot?.ppeSelected,record.job?.assessmentPpeItems),...(record.snapshot?.ppeOtherItems||[])].join(', ');
 return {hazards:changes?.hazards.trim()||'As recorded in this JSA’s company assessment.',controls:changes?.controls.trim()||'Follow the controls and work steps recorded in this JSA’s company assessment.',ppe:changes?.ppe.trim()||selected||'As recorded in this JSA’s PPE selection.'};
}
