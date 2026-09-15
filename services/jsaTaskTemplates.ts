import {standaloneCall} from './standaloneJsa';
export interface TaskAssessment {
  id:string; version:number; contentHash:string; name:string; tasks:string[];
  packageId:string|null;
  steps:{id:string;title:string;items:{hazard:string;controls:string}[]}[];
  ppeItems:{id:string;label:string}[];
  preparedItems:{id:string;label:string}[];
}
export async function loadTaskAssessments():Promise<{schemaVersion:number;templates:TaskAssessment[]}> {
  const result=await standaloneCall({operation:'templates'});
  if (![1,2].includes(result?.schemaVersion) || !Array.isArray(result.templates)) throw new Error('Company task assessments could not be loaded.');
  return result;
}
/** Stable ids bind acknowledgement state to the exact published wording. */
export function assembleTaskAssessments(selected:TaskAssessment[]) {
  if(!selected.length || selected.length>20 || new Set(selected.map(t=>t.id)).size!==selected.length) throw new Error('Select applicable task assessments.');
  const templates=[...selected].sort((a,b)=>a.id.localeCompare(b.id));
  const steps=templates.flatMap(t=>t.steps.map((s,i)=>({...s,id:`${t.contentHash.slice(0,12)}_s${i}`})));
  if(steps.length>40 || JSON.stringify(steps).length>100000)throw new Error('Too many assessment steps in one JSA.');
  return {
    steps,
    ppeItems:templates.flatMap(t=>t.ppeItems.map((p,i)=>({...p,id:`${t.contentHash.slice(0,12)}_p${i}`}))),
    preparedItems:templates.flatMap(t=>t.preparedItems.map((p,i)=>({...p,id:`${t.contentHash.slice(0,12)}_r${i}`}))),
    templateRefs:templates.map(({id,version,contentHash})=>({id,version,contentHash})),
    templates:templates.map(({id,version,contentHash,name,tasks})=>({id,version,contentHash,name,tasks})),
  };
}
