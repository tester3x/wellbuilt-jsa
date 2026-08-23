export type LogoutOperation =
  | 'firebaseAuth'
  | 'localIdentity'
  | 'governedState'
  | 'canonicalBaseline'
  | 'reactContext';

export interface LogoutFailure {
  operation: LogoutOperation;
  message: string;
}

export interface CompleteLogoutResult {
  firebaseAuthCleared: boolean;
  localIdentityCleared: boolean;
  governedStateCleared: boolean;
  canonicalBaselineCleared: boolean;
  reactContextReset: boolean;
  failures: LogoutFailure[];
  verified: boolean;
}

export interface CompleteLogoutOps {
  clearFirebaseAuth(): Promise<boolean>;
  clearLegacyDriverSession(): Promise<void>;
  clearGovernedState(): Promise<void>;
  clearCanonicalIdentityState(): Promise<void>;
  resetAuthContext(): void | Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'operation_failed';
}

export function logoutTransitionAuthorized(result: CompleteLogoutResult): boolean {
  return result.verified;
}

export function createSingleFlightLogout<T>(run: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null;
  return () => {
    if (active) return active;
    active = run().finally(() => { active = null; });
    return active;
  };
}

export async function runCompleteJsaLogout(ops: CompleteLogoutOps): Promise<CompleteLogoutResult> {
  const result: CompleteLogoutResult = {
    firebaseAuthCleared: false,
    localIdentityCleared: false,
    governedStateCleared: false,
    canonicalBaselineCleared: false,
    reactContextReset: false,
    failures: [],
    verified: false,
  };
  const attempt = async (
    operation: LogoutOperation,
    run: () => void | boolean | Promise<void | boolean>,
    mark: (ok: boolean) => void,
  ) => {
    try {
      const value = await run();
      const ok = value !== false;
      mark(ok);
      if (!ok) result.failures.push({ operation, message: 'verification_failed' });
    } catch (error) {
      mark(false);
      result.failures.push({ operation, message: messageOf(error) });
    }
  };

  await attempt('firebaseAuth', ops.clearFirebaseAuth, (ok) => { result.firebaseAuthCleared = ok; });
  await attempt('localIdentity', ops.clearLegacyDriverSession, (ok) => { result.localIdentityCleared = ok; });
  await attempt('governedState', ops.clearGovernedState, (ok) => { result.governedStateCleared = ok; });
  await attempt('canonicalBaseline', ops.clearCanonicalIdentityState, (ok) => { result.canonicalBaselineCleared = ok; });
  await attempt('reactContext', ops.resetAuthContext, (ok) => { result.reactContextReset = ok; });
  result.verified = result.firebaseAuthCleared && result.localIdentityCleared
    && result.governedStateCleared && result.canonicalBaselineCleared && result.reactContextReset;
  return result;
}
