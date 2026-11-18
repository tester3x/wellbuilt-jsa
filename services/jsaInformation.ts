import {jsaHistorySummary} from './jsaHistorySummary';
export const cleanJsaText=(v:unknown)=>typeof v==='string'&&v.trim()!=='-'?v.trim():'';
export function jsaOperator(r:any):string{return cleanJsaText(r.operator)||cleanJsaText(r.historyContext?.operator)||cleanJsaText(r.displayCorrection?.operator)||[...new Set((r.wells||[]).map((w:any)=>cleanJsaText(w?.operator)).filter(Boolean))].join(', ');}
export function missingJsaInformation(r:any):('operator'|'locations')[]{const missing:('operator'|'locations')[]=[];if(!jsaOperator(r))missing.push('operator');if(!jsaHistorySummary(r).locations.length)missing.push('locations');return missing;}
export function requireJsaSaveInformation(r:any){const missing=missingJsaInformation({operator:r.operator,wells:r.wells,wellName:r.wellName,locations:r.locations,location:r.location});if(missing.length)throw Error('Return to Job Details and select '+missing.map(x=>x==='operator'?'an operator':'an initial location').join(' and ')+' before signing.');}
