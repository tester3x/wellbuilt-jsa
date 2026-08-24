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
  cleanupOwnedInstallationWithinMutation,
  governedIdentityEpochIsCurrent,
  persistAfterExchange,
  reserveGovernedIdentityEpoch,
  runGovernedIdentityMutation,
} from './jsaGovernedAuthLive';
import { loadGovernedSession } from './jsaRuntime';

const tokenizer = createManualAttemptTokenizer({
  randomBytes: (count) => Crypto.getRandomBytesAsync(count),
  sha256: (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
});
const coordinator = createManualLoginCoordinator<ManualLoginResult>();

async function clearInstallationIfOwned(owner: ManualInstallationOwner): Promise<void> {
  await runGovernedIdentityMutation(async () => {
    const result = await cleanupOwnedInstallationWithinMutation(owner);
    if (!result.ok) throw new Error(`owned_cleanup_${result.failure}`);
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
