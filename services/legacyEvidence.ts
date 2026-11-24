import {createLegacyEvidenceClient} from './legacyEvidenceCore';
const runtime=createLegacyEvidenceClient({
 session:async()=>(await import('./sso/jsaGovernedAuthLive')).loadUsableGovernedSession(),
 call:async body=>{const {app}=await import('./firebase');const {getFunctions,httpsCallable}=await import('firebase/functions');return (await httpsCallable(getFunctions(app),'jsaLegacyEvidence',{timeout:15000})(body)).data;},
});
export const legacyEvidenceCall=runtime.legacyEvidenceCall;
export const persistLegacyJsaEvidence=runtime.persistLegacyJsaEvidence;
