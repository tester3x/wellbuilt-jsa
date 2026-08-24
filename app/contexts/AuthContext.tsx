// app/contexts/AuthContext.tsx
// Auth context for WB JSA — wraps the entire app with driver session state.
// Manual login and Suite SSO both install the governed Firebase Auth session.

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { CompleteLogoutResult } from "../../services/sso/jsaLogoutContract";
import {
  submitRegistration,
  getPendingRegistration,
  checkRegistrationStatus,
  clearPendingRegistration,
} from "../../services/driverAuth";

export interface GovernedDriverPresentation {
  authKind: 'governed';
  uid: string;
  driverId: string;
  companyId: string;
  companyName: null;
  displayName: string | null;
  legalName: string | null;
}

export type AuthMode =
  | "checking"
  | "login"
  | "register"
  | "verifying"
  | "registering"
  | "pending"
  | "approved"
  | "rejected"
  | "error"
  | "authenticated";

interface AuthContextValue {
  /** Current auth mode */
  mode: AuthMode;
  /** Driver session (null if not authenticated) */
  session: GovernedDriverPresentation | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Error message from last operation */
  error: string;
  /** Name shown while pending */
  pendingName: string;

  /** Sign in with name + passcode */
  login: (displayName: string, passcode: string) => Promise<boolean>;
  /** Register a new driver (company flow — pending approval) */
  register: (displayName: string, passcode: string, companyName?: string, legalName?: string) => Promise<boolean>;
  /** After approval, return the driver to normal login. Never mints a session. */
  completeReg: () => Promise<boolean>;
  /** Cancel pending registration */
  cancelRegistration: () => Promise<void>;
  /** Sign out */
  logout: () => Promise<CompleteLogoutResult>;
  /** Switch to register mode */
  switchToRegister: () => void;
  /** Switch to login mode */
  switchToLogin: () => void;
  /** Try again after error */
  tryAgain: () => void;

  /** SSO login — called when launched from WB S with hash+name */
  ssoLogin: (hash: string, displayName: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<AuthMode>("checking");
  const [session, setSession] = useState<GovernedDriverPresentation | null>(null);
  const [error, setError] = useState("");
  const [pendingName, setPendingName] = useState("");
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const loginAttemptRef = React.useRef(0);

  const governedPresentationSession = (governed: {
    uid: string; driverId: string; companyId: string;
    displayName: string | null; legalName: string | null;
  }): GovernedDriverPresentation => ({
    authKind: 'governed',
    uid: governed.uid,
    driverId: governed.driverId,
    displayName: governed.displayName,
    legalName: governed.legalName,
    companyId: governed.companyId,
    companyName: null,
  });

  // Check initial state on mount
  useEffect(() => {
    checkInitialState();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Auto-poll for registration approval when pending
  useEffect(() => {
    if (mode === "pending") {
      pollRef.current = setInterval(async () => {
        try {
          const status = await checkRegistrationStatus();
          if (status === "approved") {
            if (pollRef.current) clearInterval(pollRef.current);
            // Governed pending approval never mints a local session.
            setMode("login");
            setError("Registration approved. Please sign in.");
          } else if (status === "rejected") {
            if (pollRef.current) clearInterval(pollRef.current);
            setMode("rejected");
          }
        } catch (err) {
          console.log("[AuthContext-JSA] Poll error (will retry):", err);
        }
      }, 5000);

      return () => {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      };
    }
  }, [mode]);

  const checkInitialState = async () => {
    try {
      const { inspectGovernedIdentityStartupDetailed } = await import('../../services/sso/jsaIdentityStartupLive');
      const governedInspection = await inspectGovernedIdentityStartupDetailed();
      if (governedInspection.state === 'usable') {
        const { loadGovernedSession } = await import('../../services/sso/jsaRuntime');
        const governed = await loadGovernedSession();
        if (governed) {
          setSession(governedPresentationSession(governed));
          setMode('authenticated');
          return;
        }
      } else if (governedInspection.state !== 'standalone') {
        // One-sided or mismatched Firebase/session state is never allowed to
        // fall through into legacy or another driver's standalone session.
        setSession(null);
        setMode('error');
        setError('Secure sign-in requires cleanup before retrying.');
        return;
      }
      // Standalone means NO governed identity. Retire only obsolete auth keys;
      // pending registration, historical/active JSAs and recovery queues survive.
      const { retireLegacyAuthenticationKeys } = await import('../../services/sso/jsaLegacyAuthRetirementLive');
      const retirement = await retireLegacyAuthenticationKeys();
      if (!retirement.retired) {
        setSession(null);
        setMode('error');
        setError('Old sign-in data could not be cleared. Retry secure sign-in cleanup.');
        return;
      }

      // Check for pending registration
      const pending = await getPendingRegistration();
      if (pending) {
        setPendingName(pending.displayName);
        const status = await checkRegistrationStatus();
        if (status === "approved") {
          setMode("login");
          setError("Registration approved. Please sign in.");
        } else if (status === "rejected") {
          setMode("rejected");
        } else {
          setMode("pending");
        }
        return;
      }

      setMode("login");
    } catch (err) {
      console.error("[AuthContext-JSA] Initial check error:", err);
      setSession(null);
      setMode("error");
      setError('Secure sign-in could not be verified. Check your connection and retry.');
    }
  };

  const login = useCallback(async (displayName: string, passcode: string): Promise<boolean> => {
    const attempt = ++loginAttemptRef.current;
    setMode("verifying");
    setError("");

    try {
      const { manualGovernedLogin } = await import('../../services/sso/jsaManualLoginLive');
      const result = await manualGovernedLogin(displayName.trim(), passcode);
      if (attempt !== loginAttemptRef.current) return false;
      if (result.ok) {
        const { loadGovernedSession } = await import('../../services/sso/jsaRuntime');
        const governed = await loadGovernedSession();
        if (!governed || governed.uid !== result.payload.uid
          || governed.driverId !== result.payload.driverId
          || governed.companyId !== result.payload.companyId) {
          setMode('error');
          setError('Secure sign-in could not verify this JSA session.');
          return false;
        }
        setSession(governedPresentationSession(governed));
        setMode("authenticated");
        return true;
      }
      setMode(result.code === 'server_failure' || result.code === 'binding_mismatch' ? 'error' : 'login');
      setError(result.message);
      return false;
    } catch (err) {
      if (attempt !== loginAttemptRef.current) return false;
      setMode("error");
      setError("WellBuilt sign-in is temporarily unavailable. Try again.");
      return false;
    }
  }, []);

  const register = useCallback(async (displayName: string, passcode: string, companyName?: string, legalName?: string): Promise<boolean> => {
    setMode("registering");
    setError("");

    try {
      const result = await submitRegistration({
        passcode: passcode.trim(),
        displayName: displayName.trim(),
        companyName: companyName?.trim() || undefined,
        legalName: legalName?.trim() || undefined,
      });

      if (result.success) {
        setPendingName(displayName.trim());
        setMode("pending");
        return true;
      } else {
        setMode("register");
        setError(result.error || "Could not submit registration");
        return false;
      }
    } catch (err) {
      console.error("[AuthContext-JSA] Registration error:", err);
      setMode("register");
      setError("Connection error. Please try again.");
      return false;
    }
  }, []);

  const completeReg = useCallback(async (): Promise<boolean> => {
    setMode("login");
    setError("Registration approved. Please sign in.");
    return false;
  }, []);

  const cancelRegistration = useCallback(async () => {
    await clearPendingRegistration();
    setPendingName("");
    setMode("login");
  }, []);

  const logout = useCallback(async () => {
    const { logoutJsaCompletely } = await import("../../services/logoutJsaCompletely");
    return logoutJsaCompletely(() => {
      setSession(null);
      setError("");
      setMode("login");
    });
  }, []);

  const switchToRegister = useCallback(() => {
    setError("");
    setMode("register");
  }, []);

  const switchToLogin = useCallback(() => {
    setError("");
    setMode("login");
  }, []);

  const tryAgain = useCallback(() => {
    setError("");
    setMode("login");
  }, []);

  const ssoLogin = useCallback(async (hash: string, displayName: string): Promise<boolean> => {
    // Legacy hash/name deep links are no longer credentials. Governed Suite
    // SSO continues through sso-callback.tsx and persistAfterExchange().
    void hash;
    void displayName;
    setSession(null);
    setMode('error');
    setError('Return to WellBuilt and open JSA again.');
    return false;
  }, []);

  const value: AuthContextValue = {
    mode,
    session,
    isAuthenticated: mode === "authenticated" && session !== null,
    error,
    pendingName,
    login,
    register,
    completeReg,
    cancelRegistration,
    logout,
    switchToRegister,
    switchToLogin,
    tryAgain,
    ssoLogin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
