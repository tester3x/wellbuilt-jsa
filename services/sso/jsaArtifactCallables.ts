/**
 * Authenticated jsaPersistGovernedArtifact client.
 * Same Firebase session + httpsCallable transport as get/complete.
 */
import {
  persistRequestBody,
  classifyPersistError,
  type JsaAuthoredSnapshot,
  type ArtifactStatusCode,
} from './jsaArtifactSnapshot';

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
    logPersist('update_required');
    return { ok: false, status: 'update_required', refusal: 'update_required' };
  } catch (err) {
    const status = classifyPersistError(err);
    logPersist(status);
    return { ok: false, status, refusal: status };
  }
}
