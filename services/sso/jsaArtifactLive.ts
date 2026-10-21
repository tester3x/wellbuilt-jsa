import {subscribeGovernedSessionRevision} from './jsaRuntime';
import {platformDelivery as delivery} from '../platformDelivery';
/**
 * AsyncStorage + live callable wiring for the governed artifact queue.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { completeAfterLocalSave, type JsaCompletionAction } from './jsaRequestLifecycle';
import { liveGovernedDeps } from './jsaGovernedLive';
import { jsaPersistGovernedArtifact } from './jsaArtifactCallables';
import {
  GOVERNED_ARTIFACT_QUEUE_KEY,
  parseQueueItem,
  settleArtifactQueue,
  commitGovernedAfterLocalSaveWithStore,
  settleIfAuthenticated,
  type ArtifactQueueItem,
  type ArtifactQueueStore,
  type ArtifactSaveStamp,
  type JsaAuthoredSnapshot,
} from './jsaArtifactSnapshot';

export async function loadArtifactQueue(): Promise<ArtifactQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(GOVERNED_ARTIFACT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseQueueItem).filter((i): i is ArtifactQueueItem => !!i);
  } catch {
    return [];
  }
}

export async function saveArtifactQueue(items: ArtifactQueueItem[]): Promise<void> {
  await AsyncStorage.setItem(GOVERNED_ARTIFACT_QUEUE_KEY, JSON.stringify(items));
  void delivery.changed();
}

async function loadSaves(): Promise<unknown[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.saves);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function stampSave(localRecordId: string, stamp: ArtifactSaveStamp): Promise<void> {
  const saves = await loadSaves();
  let changed = false;
  const next = saves.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const rec = item as Record<string, unknown>;
    if (rec.id !== localRecordId) return item;
    changed = true;
    return { ...rec, governedArtifact: stamp };
  });
  if (changed) await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(next));
}

let queueWriteTail:Promise<unknown>=Promise.resolve();
function liveStore(): ArtifactQueueStore {
  const session=import('./jsaGovernedAuthLive').then(m=>m.loadUsableGovernedSession());
  let seen=new Set<string>();
  const current=async()=>{const expected=await session,live=await import('./jsaGovernedAuthLive').then(m=>m.loadUsableGovernedSession());if(!expected||!live||live.uid!==expected.uid||live.generation!==expected.generation||live.driverId!==expected.driverId||live.companyId!==expected.companyId)throw Error('Session changed');return expected;};
  const ownedSaves=async()=>{const owner=await current();const saves=await loadSaves();await current();return saves.filter((v:any)=>v?.companyId===owner.companyId&&(v.driverId===owner.driverId||v.driverHash===owner.driverId));};
  const ownedQueue=async()=>{const owner=await current(),saves=await ownedSaves();const ids=new Set(saves.map((r:any)=>r.id));const queue=await loadArtifactQueue();await current();return queue.filter(i=>i.owner?i.owner.uid===owner.uid&&i.owner.driverId===owner.driverId&&i.owner.companyId===owner.companyId:ids.has(i.localRecordId));};
  return {
    nowMs: () => Date.now(),
    loadQueue:async()=>{const rows=await ownedQueue();seen=new Set(rows.map(i=>i.requestId));return rows;},
    saveQueue:async items=>{
      const owner=await current(),observed=new Set(seen);
      const run=queueWriteTail.then(async()=>{
        await current();const latest=await loadArtifactQueue();await current();
        const merged=new Map(latest.filter(i=>!observed.has(i.requestId)).map(i=>[i.requestId,i]));
        for(const item of items)merged.set(item.requestId,{...item,owner:{uid:owner.uid,driverId:owner.driverId,companyId:owner.companyId}});
        await saveArtifactQueue([...merged.values()]);
      });queueWriteTail=run.catch(()=>{});await run;
    },
    loadSaves:ownedSaves,
    stampSave:async(id,stamp)=>{await current();await stampSave(id,stamp);},
    complete: async (requestId, action, localRecordId) => {await current();return completeAfterLocalSave(liveGovernedDeps(), {
      requestId,
      action,
      localRecordId,
      nowMs: Date.now(),
    });},
    persist: async (requestId, snapshot) => {
      await current();
      const out = await jsaPersistGovernedArtifact(requestId, snapshot);
      return out.ok ? { ok: true, reused: out.result.reused } : { ok: false, status: out.status };
    },
    log: (outcome) => {
      console.log(JSON.stringify({ tag: '[jsa-artifact-queue]', outcome }));
    },
  };
}

export async function settleGovernedArtifactQueue(): Promise<void> {
  try {
    if(!delivery.canAttempt())return;
    await settleArtifactQueue(liveStore());
  } catch {
    console.log(JSON.stringify({ tag: '[jsa-artifact-queue]', outcome: 'settle_failed' }));
  }
}

/**
 * Root lifecycle settlement. Waits for governed Auth restoration, then
 * settles only when a usable governed session exists. Independent of
 * route/screen. Does not register a request, get, navigate, or create a local save.
 */
export async function settleGovernedArtifactQueueIfAuthenticated(): Promise<void> {
  try {
    const { awaitGovernedAuthReady, loadUsableGovernedSession } =
      await import('./jsaGovernedAuthLive');
    const outcome = await settleIfAuthenticated({
      awaitAuthReady: () => awaitGovernedAuthReady(),
      loadUsableSession: () => loadUsableGovernedSession(),
      settle: () => settleGovernedArtifactQueue(),
    });
    if (outcome === 'skipped_no_session') {
      console.log(JSON.stringify({ tag: '[jsa-artifact-queue]', outcome: 'skipped_no_session' }));
    }
  } catch {
    console.log(JSON.stringify({ tag: '[jsa-artifact-queue]', outcome: 'settle_failed' }));
  }
}

export async function commitGovernedAfterLocalSave(input: {
  requestId: string;
  action: JsaCompletionAction;
  localRecordId: string;
  snapshot: JsaAuthoredSnapshot;
  localSaveOk: boolean;
}) {
  return commitGovernedAfterLocalSaveWithStore(liveStore(), input);
}

/** Owner-scoped recovery of the exact durable save; never starts a new JSA. */
export async function pendingGovernedArtifact(requestId: string): Promise<ArtifactQueueItem | null> {
  return (await liveStore().loadQueue()).find(row => row.requestId === requestId && row.artifactState !== 'succeeded') || null;
}
export async function retrySavedGovernedArtifact(requestId: string): Promise<void> {
  const store = liveStore();
  const rows = await store.loadQueue();
  await store.saveQueue(rows.map(row => row.requestId === requestId && row.artifactState !== 'blocked' ? { ...row, nextAttemptAtMs: store.nowMs() } : row));
  await settleArtifactQueue(store);
}

export function installJsaArtifactDelivery(){const off=subscribeGovernedSessionRevision(()=>{void delivery.changed();});const unregister=delivery.register('jsa-artifacts',{
 pending:async()=>(await liveStore().loadQueue()).filter(i=>i.artifactState!=='blocked'&&i.artifactState!=='succeeded').map(i=>i.nextAttemptAtMs),
 flush:settleGovernedArtifactQueueIfAuthenticated,
});return()=>{off();unregister();};}
