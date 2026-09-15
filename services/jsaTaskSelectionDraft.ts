import AsyncStorage from '@react-native-async-storage/async-storage';
import {loadUsableGovernedSession} from './sso/jsaGovernedAuthLive';
import {loadLaunchContext} from './sso/jsaRuntime';
import type {assembleTaskAssessments} from './jsaTaskTemplates';

type Selection = ReturnType<typeof assembleTaskAssessments>;
const key = (uid:string,companyId:string,sessionId:string)=>`jsa.taskDraft.v1:${uid}:${companyId}:${sessionId}`;
const sessionOk = (id:string)=>/^[A-Za-z0-9._-]{1,64}$/.test(id);
function parse(raw:string|null):Selection|null {
  if(!raw)return null;
  if(raw.length>180000)throw new Error('Saved task selection is too large.');
  const value=JSON.parse(raw);
  if(!value || !Array.isArray(value.templateRefs) || !value.templateRefs.length || value.templateRefs.length>20 ||
    !Array.isArray(value.templates) || !Array.isArray(value.steps) || !value.steps.length || value.steps.length>40 ||
    !Array.isArray(value.ppeItems) || !Array.isArray(value.preparedItems))throw new Error('Saved task selection could not be restored.');
  return value;
}
async function ownerFor(sessionId:string){
  if(!sessionOk(sessionId))throw new Error('Open this JSA from Job Details to restore its task selection.');
  const owner=await loadUsableGovernedSession();
  if(!owner || await loadLaunchContext())throw new Error('This standalone task selection is not available in the current session.');
  return owner;
}
async function stillOwned(owner:Awaited<ReturnType<typeof ownerFor>>){
  const current=await loadUsableGovernedSession();
  if(!current || current.uid!==owner.uid || current.companyId!==owner.companyId || current.generation!==owner.generation || await loadLaunchContext())
    throw new Error('Session changed. Reopen your JSA.');
}
export async function loadTaskSelectionDraft(sessionId:string):Promise<Selection|null>{
  const owner=await ownerFor(sessionId);
  const selection=parse(await AsyncStorage.getItem(key(owner.uid,owner.companyId,sessionId)));
  await stillOwned(owner);
  return selection;
}
let writes:Promise<unknown>=Promise.resolve();
export function freezeTaskSelectionDraft(sessionId:string,selection:Selection):Promise<Selection>{
  const task=async()=>{
    const owner=await ownerFor(sessionId),draftKey=key(owner.uid,owner.companyId,sessionId);
    const encoded=JSON.stringify(selection);parse(encoded);
    const existing=await AsyncStorage.getItem(draftKey);
    await stillOwned(owner);
    if(existing && existing!==encoded)throw new Error('This JSA already has its assessments selected. Start a new JSA to change the wording.');
    if(!existing)await AsyncStorage.setItem(draftKey,encoded);
    await stillOwned(owner);
    return selection;
  };
  const result=writes.then(task,task);writes=result.catch(()=>{});return result;
}
