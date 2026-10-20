import {decidePlatformAppEntry,classifyPlatformFailure} from '../platformRuntime.generated';
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

const pendingRefresh=new Set<string>();
function refreshCachedIdentity(session: NonNullable<Awaited<ReturnType<typeof loadGovernedSession>>>, user: NonNullable<ReturnType<typeof getGovernedAuth>['currentUser']>) {
  if(pendingRefresh.has(session.generation))return;
  pendingRefresh.add(session.generation);
  const retire=async()=>{
    const auth=await import('./jsaGovernedAuthLive');
    await auth.runGovernedIdentityMutation(async()=>{
      const result=await auth.cleanupOwnedInstallationWithinMutation(session);
      if(result.ok){const runtime=await import('./jsaRuntime');runtime.publishGovernedSessionReady();}
    });
  };
  void user.getIdTokenResult(false).then(async token=>{
    if(token.claims.driverId!==session.driverId||token.claims.companyId!==session.companyId)await retire();
  },async error=>{if(classifyPlatformFailure(error)==='access')await retire();})
    .catch(()=>{}).finally(()=>pendingRefresh.delete(session.generation));
}
export async function inspectGovernedIdentityStartupDetailed(options:{preferCached?:boolean}={}): Promise<GovernedIdentityInspection> {
  void import('../deviceAccount').then(m=>m.publishJsaDeviceAccount()).catch(()=>{});
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const rawSessionPresent = await hasRawGovernedSession();
  const session = await loadGovernedSession();
  const user = auth.currentUser;
  let tokenDriverId: string | null = null;
  let tokenCompanyId: string | null = null;
  const finalized=session?await installationFinalizedFor({status:'finalized',generation:session.generation,uid:session.uid,driverId:session.driverId,companyId:session.companyId}):false;
  const baseline=session&&user?await governedBaselineReady({uid:session.uid,driverId:session.driverId,companyId:session.companyId},session.generation):false;
  const entry=decidePlatformAppEntry({restored:true,sdkUid:user?.uid||null,
    session:session?{owner:session,establishedAccess:finalized&&baseline}:null});
  if(options.preferCached && user && session && entry==='resume'){
    tokenDriverId=session.driverId;tokenCompanyId=session.companyId;
    refreshCachedIdentity(session,user);
  } else if (user) {
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
