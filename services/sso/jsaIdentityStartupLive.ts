import { awaitGovernedAuthReady, getGovernedAuth } from './jsaGovernedAuthLive';
import { hasRawGovernedSession, loadGovernedSession } from './jsaRuntime';
import { classifyGovernedStartup, type GovernedStartupState } from './jsaIdentityStartupContract';
import { governedBaselineReady } from './jsaLogoutWatcherLive';

export async function inspectGovernedIdentityStartup(): Promise<GovernedStartupState> {
  await awaitGovernedAuthReady();
  const auth = getGovernedAuth();
  const rawSessionPresent = await hasRawGovernedSession();
  const session = await loadGovernedSession();
  const user = auth.currentUser;
  let tokenDriverId: string | null = null;
  let tokenCompanyId: string | null = null;
  if (user) {
    const token = await user.getIdTokenResult();
    tokenDriverId = typeof token.claims.driverId === 'string' ? token.claims.driverId : null;
    tokenCompanyId = typeof token.claims.companyId === 'string' ? token.claims.companyId : null;
  }
  return classifyGovernedStartup({
    rawSessionPresent,
    session: session ? { uid: session.uid, driverId: session.driverId, companyId: session.companyId } : null,
    firebaseUid: user?.uid ?? null,
    tokenDriverId,
    tokenCompanyId,
    baselineBound: session && user ? await governedBaselineReady({ uid: session.uid, driverId: session.driverId, companyId: session.companyId }) : undefined,
  });
}
