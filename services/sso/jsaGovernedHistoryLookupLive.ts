import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { inspectGovernedIdentityStartupDetailed } from './jsaIdentityStartupLive';
import { loadGovernedSession } from './jsaRuntime';
import { lookupGovernedShiftHistory } from './jsaGovernedHistoryLookup';

const RUN_QUERY = 'https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents:runQuery';

export async function authenticatedGovernedFirestoreFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const inspection = await inspectGovernedIdentityStartupDetailed();
  const session = await loadGovernedSession();
  const user = getAuth(getApp()).currentUser;
  if (inspection.state !== 'usable' || !session || !user || user.uid !== session.uid) {
    throw new Error('governed_identity_unavailable');
  }
  const token = await user.getIdToken(true);
  if (!token) throw new Error('governed_token_unavailable');
  return fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
}

export function lookupCurrentGovernedShiftHistory(shiftId: string) {
  return lookupGovernedShiftHistory(shiftId, {
    inspectIdentity: async () => {
      const inspection = await inspectGovernedIdentityStartupDetailed();
      const session = await loadGovernedSession();
      return { state: inspection.state, session, firebaseUid: getAuth(getApp()).currentUser?.uid ?? null };
    },
    freshIdToken: async (expectedUid) => {
      const user = getAuth(getApp()).currentUser;
      if (!user || user.uid !== expectedUid) throw new Error('auth_identity_changed');
      return user.getIdToken(true);
    },
    runQuery: async ({ token, driverId, companyId, shiftId: exactShift }) => {
      const response = await fetch(RUN_QUERY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'jsas' }],
          where: { compositeFilter: { op: 'AND', filters: [
            { fieldFilter: { field: { fieldPath: 'driverId' }, op: 'EQUAL', value: { stringValue: driverId } } },
            { fieldFilter: { field: { fieldPath: 'companyId' }, op: 'EQUAL', value: { stringValue: companyId } } },
            { fieldFilter: { field: { fieldPath: 'shiftId' }, op: 'EQUAL', value: { stringValue: exactShift } } },
          ] } }, limit: 10,
        } }),
      });
      if (!response.ok) {
        const error = new Error(`history_query_${response.status}`) as Error & { status: number };
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
  });
}
