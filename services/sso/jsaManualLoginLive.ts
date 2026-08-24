import * as Crypto from 'expo-crypto';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  createManualAttemptTokenizer,
  createManualLoginCoordinator,
  executeManualLoginAttempt,
  manualInspectionMatches,
  type ManualInstallationOwner,
  type ManualLoginResult,
} from './jsaManualLogin';
import {
  inspectGovernedIdentityStartupDetailed,
} from './jsaIdentityStartupLive';
import {
  currentGovernedAuthUid,
  governedIdentityEpochIsCurrent,
  persistAfterExchange,
  reserveGovernedIdentityEpoch,
  runGovernedIdentityMutation,
  signOutGovernedAuthWithinMutation,
} from './jsaGovernedAuthLive';
import {
  clearGovernedSessionIfGeneration,
  loadGovernedSession,
} from './jsaRuntime';
import { clearCanonicalIdentityStateIfOwned } from './jsaCanonicalProfile';

const tokenizer = createManualAttemptTokenizer({
  randomBytes: (count) => Crypto.getRandomBytesAsync(count),
  sha256: (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
});
const coordinator = createManualLoginCoordinator<ManualLoginResult>();

async function clearInstallationIfOwned(owner: ManualInstallationOwner): Promise<void> {
  await runGovernedIdentityMutation(async () => {
    const installed = await loadGovernedSession();
    const exact = installed?.generation === owner.generation
      && installed.uid === owner.uid
      && installed.driverId === owner.driverId
      && installed.companyId === owner.companyId
      && currentGovernedAuthUid() === owner.uid;
    if (!exact) return;
    if (!(await signOutGovernedAuthWithinMutation())) throw new Error('owned_auth_cleanup_failed');
    await clearGovernedSessionIfGeneration(owner.generation);
    if (await loadGovernedSession()) throw new Error('owned_session_cleanup_failed');
    if (!(await clearCanonicalIdentityStateIfOwned(owner))) throw new Error('owned_baseline_cleanup_failed');
  });
}

async function runManualLogin(
  displayName: string,
  passcode: string,
  stillCurrent: () => boolean,
): Promise<ManualLoginResult> {
  const identityEpoch = reserveGovernedIdentityEpoch();
  const current = () => stillCurrent() && governedIdentityEpochIsCurrent(identityEpoch);
  return executeManualLoginAttempt({ displayName, passcode, stillCurrent: current }, {
    call: async (request) => {
      const callable = httpsCallable(
        getFunctions(getApp()),
        'authenticateDriver',
        { timeout: 15_000 },
      );
      // Passcode exists only in this governed callable request and local call stack.
      return (await callable(request)).data;
    },
    install: async (payload, attemptCurrent) => {
      const installed = await persistAfterExchange(payload, { stillCurrent: attemptCurrent, identityEpoch });
      return { generation: installed.generation, uid: installed.uid, driverId: installed.driverId, companyId: installed.companyId };
    },
    inspect: async (payload, owner) => {
      const inspection = await inspectGovernedIdentityStartupDetailed();
      const installed = await loadGovernedSession();
      return installed?.generation === owner.generation && manualInspectionMatches(payload, {
        state: inspection.state,
        binding: inspection.binding,
        sessionBinding: installed?.binding,
      });
    },
    cleanup: clearInstallationIfOwned,
  });
}

export async function manualGovernedLogin(
  displayName: string,
  passcode: string,
): Promise<ManualLoginResult> {
  const token = await tokenizer(displayName, passcode);
  return coordinator.run(token, (stillCurrent) => runManualLogin(
    displayName,
    passcode,
    stillCurrent,
  ));
}
