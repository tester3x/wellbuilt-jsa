export interface CompleteLogoutOps {
  signOutGovernedAuth(): Promise<void>;
  clearLegacyDriverSession(): Promise<void>;
  clearGovernedState(): Promise<void>;
  clearCanonicalIdentityState(): Promise<void>;
  resetAuthContext(): void | Promise<void>;
}
export async function runCompleteJsaLogout(ops: CompleteLogoutOps): Promise<void> {
  const cleanup = [
    ops.signOutGovernedAuth,
    ops.clearLegacyDriverSession,
    ops.clearGovernedState,
    ops.clearCanonicalIdentityState,
    ops.resetAuthContext,
  ];
  for (const operation of cleanup) {
    try {
      await operation();
    } catch {
      // Logout is best-effort per store, but exhaustive: one corrupt local key
      // must not leave Firebase auth or another identity store active.
    }
  }
}
