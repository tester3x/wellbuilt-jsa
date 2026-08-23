import * as Crypto from 'expo-crypto';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  createManualAttemptTokenizer,
  createManualLoginCoordinator,
  executeManualLoginAttempt,
  manualInspectionMatches,
  type ManualLoginResult,
} from './jsaManualLogin';
import {
  inspectGovernedIdentityStartupDetailed,
} from './jsaIdentityStartupLive';
import {
  persistAfterExchange,
  signOutGovernedAuth,
} from './jsaGovernedAuthLive';
import {
  clearGovernedSessionIfGeneration,
  loadGovernedSession,
} from './jsaRuntime';
import { clearCanonicalIdentityState } from './jsaCanonicalProfile';

const tokenizer = createManualAttemptTokenizer({
  randomBytes: (count) => Crypto.getRandomBytesAsync(count),
  sha256: (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
});
const coordinator = createManualLoginCoordinator<ManualLoginResult>();

async function clearFailedInstallation(): Promise<void> {
  const installed = await loadGovernedSession();
  try { await signOutGovernedAuth(); } catch { /* result remains failed closed */ }
  if (installed) await clearGovernedSessionIfGeneration(installed.generation);
  try { await clearCanonicalIdentityState(); } catch { /* no readiness */ }
}

async function runManualLogin(
  displayName: string,
  passcode: string,
  stillCurrent: () => boolean,
): Promise<ManualLoginResult> {
  return executeManualLoginAttempt({ displayName, passcode, stillCurrent }, {
    call: async (request) => {
      const callable = httpsCallable(
        getFunctions(getApp()),
        'authenticateDriver',
        { timeout: 15_000 },
      );
      // Passcode exists only in this governed callable request and local call stack.
      return (await callable(request)).data;
    },
    install: async (payload, current) => { await persistAfterExchange(payload, { stillCurrent: current }); },
    inspect: async (payload) => {
      const inspection = await inspectGovernedIdentityStartupDetailed();
      const installed = await loadGovernedSession();
      return manualInspectionMatches(payload, {
        state: inspection.state,
        binding: inspection.binding,
        sessionBinding: installed?.binding,
      });
    },
    cleanup: clearFailedInstallation,
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
