/** Read-only presentation enrichment. Never supplies acknowledgement or shift authority. */
const stable=(v:any):string=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(stable(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(stable(v[k]))])):v??null);
export function jsaDisplayReference(value:unknown):string {
 const text=typeof value==='string'?value:'';
 return /^JSA-[A-Za-z0-9_-]{40,}$/.test(text)?'Pending sync':text;
}
export function enrichResumedJsa(record:any,rows:any[],owner:{companyId:string;driverId:string},adapt:(v:any)=>any){
 const original=rows.find(r=>r.governedRequestRef===record.id&&r.companyId===owner.companyId&&(r.driverId===owner.driverId||!r.driverId&&r.driverHash===owner.driverId));
 if(!original)return record;
 const parsed=adapt(original);if(!parsed.ok)return record;
 // Require every authored answer and the drawn signature to match the server copy.
 const snapshot=parsed.value;
 const server={...record,printedName:record.driverName,formDate:record.date,
   signature:{mimeType:'image/png',data:String(record.signatureImage||'').replace(/^data:image\/png;base64,/,'')}};
 if(Object.keys(snapshot).some(k=>stable(snapshot[k])!==stable(server[k])))return record;
 const steps=original.assessmentSteps;
 if(!Array.isArray(steps)||!steps.length||steps.length>40||JSON.stringify(steps).length>100000)return record;
 const ids=steps.map(s=>s.id);
 if(new Set(ids).size!==ids.length||ids.length!==Object.keys(record.stepAcks||{}).length||ids.some(id=>record.stepAcks[id]!==true))return record;
 const extra:any={assessmentSteps:steps,assessmentArchiveUnavailable:false};
 for(const key of ['assessmentTemplates','assessmentPpeItems','assessmentPreparedItems','locationLayout'])if(original[key]!==undefined)extra[key]=original[key];
 return {...record,...extra};
}
