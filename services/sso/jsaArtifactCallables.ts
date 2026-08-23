/**
 * Authenticated jsaPersistGovernedArtifact client.
 * Same Firebase session + httpsCallable transport as get/complete.
 */
import {
  persistRequestBody,
  parsePersistResult,
  classifyPersistError,
  type JsaAuthoredSnapshot,
  type ArtifactStatusCode,
} from './jsaArtifactSnapshot';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

const TIMEOUT_MS = 15_000;

export type PersistOutcome =
  | { ok: true; result: import('./jsaArtifactSnapshot').JsaPersistResult }
  | { ok: false; status: ArtifactStatusCode; refusal: string };

function logPersist(outcome: string): void {
  console.log(JSON.stringify({ tag: '[jsa-artifact]', outcome }));
}

export async function jsaPersistGovernedArtifact(
  requestId: string,
  snapshot: JsaAuthoredSnapshot,
): Promise<PersistOutcome> {
  const body = persistRequestBody(requestId, snapshot);
  if (!body.ok) {
    logPersist('malformed');
    return { ok: false, status: 'malformed', refusal: body.refusal };
  }
  try {
    const callable = httpsCallable(
      getFunctions(getApp()),
      'jsaPersistGovernedArtifact',
      { timeout: TIMEOUT_MS },
    );
    const result = await callable(body.value);
    const parsed = parsePersistResult(result.data);
    if (!parsed.ok) {
      logPersist('malformed');
      return { ok: false, status: 'malformed', refusal: 'malformed' };
    }
    logPersist(parsed.value.reused ? 'reused' : 'created');
    return { ok: true, result: parsed.value };
  } catch (err) {
    const status = classifyPersistError(err);
    logPersist(status);
    return { ok: false, status, refusal: status };
  }
}
