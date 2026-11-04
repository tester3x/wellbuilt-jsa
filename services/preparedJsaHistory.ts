/** Display projection only; never feed these retained rows into a Start gate. */
export function projectPreparedJsaHistory(entries:any[], owner:{companyId:string;driverId:string}):any[]{
 const out:any[]=[];
 for(const {event:e,grant:g,job,coveredJobs=[]} of entries){
  if(e?.companyId!==owner.companyId||e?.driverId!==owner.driverId||g?.companyId!==owner.companyId||g?.driverId!==owner.driverId
   ||e.kind!=='read'||e.grantId!==g.id||!Number.isFinite(e.occurredAtMs)||!e.snapshot?.signature?.data)continue;
  const a=g.assessments?.find((a:any)=>a.contentHash===e.assessmentHash);if(!a)continue;
  const s=e.snapshot,wellName=job?.wellName||'',activity=job?.jobType||'';
  const covered=[{jobRef:e.jobRef,wellName,jobType:activity,recordedAtMs:e.occurredAtMs,method:'read_and_acknowledged'},
   ...coveredJobs.filter((x:any)=>x.event?.companyId===owner.companyId&&x.event?.driverId===owner.driverId&&x.event?.fullReadId===e.id)
    .map((x:any)=>({jobRef:x.event.jobRef,wellName:x.job?.wellName||'',jobType:x.job?.jobType||'',recordedAtMs:x.event.occurredAtMs,method:x.event.kind}))];
  out.push({...s,...owner,id:e.id,workflow:'prepared',state:'saved',jobRef:e.jobRef,
   shiftId:g.shiftId,jsaPeriodId:g.binding?.jsaPeriodId,driverHash:owner.driverId,
   timestamp:new Date(e.occurredAtMs).toISOString(),date:s.formDate||g.policyDay,
   driverName:s.printedName,signature:s.printedName,signatureImage:'data:image/png;base64,'+s.signature.data,
   operator:e.operator,companyName:g.jobSettings?.name||'',truckNumber:s.truckNumber||job?.truckNumber||'',jobActivityName:activity,task:activity,wellName,
   wells:wellName?[{name:wellName,jobType:activity,operator:e.operator}]:[],locations:s.locations||[],coveredJobs:covered,
   packageId:job?.packageId||null,assessmentSteps:a.steps,assessmentPpeItems:a.ppeItems||[],assessmentPreparedItems:a.preparedItems||[],
   assessmentTemplates:a.templates||[],assessmentHash:e.assessmentHash});
 }
 return out;
}

export function mergePreparedHistory(legacy:any[], cached:any[], local:any[]):any[]{
 const rows=new Map<string,any>();
 // Native signed evidence retains the frozen assessment when the cloud export
 // has only the authored answers. A refresh never replaces a legacy row.
 for(const r of [...cached,...local])rows.set(r.id,r);
 for(const r of legacy)rows.set(r.id,r);
 return [...rows.values()];
}
