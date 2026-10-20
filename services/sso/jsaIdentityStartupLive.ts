import {canRestoreVerifiedOffline} from '../transientConnection';
import { awaitGovernedAuthReady, getGovernedAuth } from './jsaGovernedAuthLive';
import { hasRawGovernedSession, installationFinalizedFor, installationMarkerStatus, loadGovernedSession } from './jsaRuntime';
import { classifyGovernedStartup, type GovernedStartupState } from './jsaIdentityStartupContract';
import { governedBaselineReady } from './jsaLogoutWatcherLive';
import type { LogoutWatcherBinding } from './jsaLogoutWatcherContract';

export interface GovernedIdentityInspection {
  state: GovernedStartupState;
  binding: LogoutWatcherBinding | null;
}

export async function inspectGovernedIdentityStartupDetailed(): Promise<GovernedIdentityInspection> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const rawSessionPresent = await hasRawGovernedSession();
  const session = await loadGovernedSession();
  const user = auth.currentUser;
  let tokenDriverId: string | null = null;
  let tokenCompanyId: string | null = null;
  const finalized=session?await installationFinalizedFor({status:'finalized',generation:session.generation,uid:session.uid,driverId:session.driverId,companyId:session.companyId}):false;
  const baseline=session&&user?await governedBaselineReady({uid:session.uid,driverId:session.driverId,companyId:session.companyId},session.generation):false;
  if (user) {
    try {
      const token=await user.getIdTokenResult();
      tokenDriverId=typeof token.claims.driverId==='string'?token.claims.driverId:null;
      tokenCompanyId=typeof token.claims.companyId==='string'?token.claims.companyId:null;
    } catch(error) {
      if(!session||!canRestoreVerifiedOffline({error,uid:user.uid,savedUid:session.uid,finalized,baseline}))throw error;
      // Restore local presentation from the previously completed secure installation.
      // Server operations still require a valid SDK token and backend authorization.
      tokenDriverId=session.driverId;tokenCompanyId=session.companyId;
    }
  }
  const current = await loadGovernedSession();
  if (getGovernedAuth().currentUser?.uid !== user?.uid || current?.generation !== session?.generation
    || current?.uid !== session?.uid || current?.companyId !== session?.companyId || current?.driverId !== session?.driverId) {
    throw new Error('JSA session changed during restoration. Retry.');
  }
  const state = classifyGovernedStartup({
    rawSessionPresent,
    session: session ? { uid: session.uid, driverId: session.driverId, companyId: session.companyId } : null,
    firebaseUid: user?.uid ?? null,
    tokenDriverId,
    tokenCompanyId,
    installationMarkerState: await installationMarkerStatus(),
    installationFinalized: finalized,
    baselineBound: baseline,
  });
  return {
    state,
    binding: state === 'usable' && session
      ? { uid: session.uid, driverId: session.driverId, companyId: session.companyId }
      : null,
  };
}

export async function inspectGovernedIdentityStartup(): Promise<GovernedStartupState> {
  return (await inspectGovernedIdentityStartupDetailed()).state;
}
