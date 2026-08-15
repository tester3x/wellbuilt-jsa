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

function liveStore(): ArtifactQueueStore {
  return {
    nowMs: () => Date.now(),
    loadQueue: loadArtifactQueue,
    saveQueue: saveArtifactQueue,
    loadSaves,
    stampSave,
    complete: async (requestId, action, localRecordId) => completeAfterLocalSave(liveGovernedDeps(), {
      requestId,
      action,
      localRecordId,
      nowMs: Date.now(),
    }),
    persist: async (requestId, snapshot) => {
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
    await settleArtifactQueue(liveStore());
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
