// app/contexts/AuthContext.tsx
// Auth context for WB JSA — wraps the entire app with driver session state.
// Uses the same Firebase auth as WB S / WB M (name + passcode → SHA-256 → RTDB).

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  DriverSession,
  getDriverSession,
  clearDriverSession,
  verifyLogin,
  saveDriverSession,
  submitRegistration,
  isPasscodeAvailable,
  getPendingRegistration,
  checkRegistrationStatus,
  completeRegistration,
  clearPendingRegistration,
  revalidateDriverSession,
} from "../../services/driverAuth";

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
  session: DriverSession | null;
  /** Whether the user is authenticated */
  isAuthenticated: boolean;
  /** Error message from last operation */
  error: string;
  /** Name shown while pending */
  pendingName: string;

  /** Sign in with name + passcode */
  login: (displayName: string, passcode: string) => Promise<boolean>;
  /** Register a new driver */
  register: (displayName: string, passcode: string, companyName?: string) => Promise<boolean>;
  /** Complete registration after admin approval */
  completeReg: () => Promise<boolean>;
  /** Cancel pending registration */
  cancelRegistration: () => Promise<void>;
  /** Sign out */
  logout: () => Promise<void>;
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
  const [session, setSession] = useState<DriverSession | null>(null);
  const [error, setError] = useState("");
  const [pendingName, setPendingName] = useState("");
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

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
            const result = await completeRegistration();
            if (result.success) {
              const driverSession = await getDriverSession();
              setSession(driverSession);
              setMode("authenticated");
            } else {
              setMode("approved");
            }
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
      // Check for existing session
      const existingSession = await getDriverSession();
      if (existingSession) {
        // Revalidate that driver is still active
        const stillValid = await revalidateDriverSession();
        if (stillValid) {
          setSession(existingSession);
          setMode("authenticated");
          return;
        }
      }

      // Check for pending registration
      const pending = await getPendingRegistration();
      if (pending) {
        setPendingName(pending.displayName);
        const status = await checkRegistrationStatus();
        if (status === "approved") {
          setMode("approved");
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
      setMode("login");
    }
  };

  const login = useCallback(async (displayName: string, passcode: string): Promise<boolean> => {
    setMode("verifying");
    setError("");

    try {
      const result = await verifyLogin(displayName.trim(), passcode.trim());

      if (result.valid && result.driverId && result.displayName && result.passcodeHash) {
        await saveDriverSession(
          result.driverId,
          result.displayName,
          result.passcodeHash,
          result.isAdmin || false,
          result.isViewer || false,
          result.companyId,
          result.companyName
        );
        const driverSession = await getDriverSession();
        setSession(driverSession);
        setMode("authenticated");
        return true;
      } else {
        setMode("login");
        setError(result.error || "Invalid name or passcode");
        return false;
      }
    } catch (err) {
      console.error("[AuthContext-JSA] Login error:", err);
      setMode("error");
      setError("Connection error. Please check your internet.");
      return false;
    }
  }, []);

  const register = useCallback(async (displayName: string, passcode: string, companyName?: string): Promise<boolean> => {
    setMode("registering");
    setError("");

    try {
      const available = await isPasscodeAvailable(passcode.trim());
      if (!available.available) {
        setMode("register");
        setError(available.reason || "This passcode is not available");
        return false;
      }

      const result = await submitRegistration({
        passcode: passcode.trim(),
        displayName: displayName.trim(),
        companyName: companyName?.trim() || undefined,
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
    setMode("verifying");

    try {
      const result = await completeRegistration();
      if (result.success) {
        const driverSession = await getDriverSession();
        setSession(driverSession);
        setMode("authenticated");
        return true;
      } else {
        setMode("error");
        setError(result.error || "Could not complete registration");
        return false;
      }
    } catch (err) {
      console.error("[AuthContext-JSA] Complete registration error:", err);
      setMode("error");
      setError("Connection error. Please try again.");
      return false;
    }
  }, []);

  const cancelRegistration = useCallback(async () => {
    await clearPendingRegistration();
    setPendingName("");
    setMode("login");
  }, []);

  const logout = useCallback(async () => {
    await clearDriverSession();
    setSession(null);
    setError("");
    setMode("login");
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
    console.log("[AuthContext-JSA] SSO login for:", displayName);

    try {
      // Look up driver by hash in Firebase
      const FIREBASE_DATABASE_URL = "https://wellbuilt-sync-default-rtdb.firebaseio.com";
      const FIREBASE_API_KEY = "AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI";
      const url = `${FIREBASE_DATABASE_URL}/drivers/approved/${hash}.json?auth=${FIREBASE_API_KEY}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error("[AuthContext-JSA] SSO: Firebase lookup failed");
        return false;
      }

      const driverData = await response.json();
      if (!driverData) {
        console.error("[AuthContext-JSA] SSO: Driver not found");
        return false;
      }

      // Handle flat structure
      if (driverData.displayName) {
        if (driverData.active === false) return false;
        await saveDriverSession(
          hash,
          driverData.displayName,
          hash,
          driverData.isAdmin === true,
          driverData.isViewer === true,
          driverData.companyId,
          driverData.companyName
        );
        const driverSession = await getDriverSession();
        setSession(driverSession);
        setMode("authenticated");
        return true;
      }

      // Handle legacy structure
      for (const key of Object.keys(driverData)) {
        const entry = driverData[key];
        if (entry.displayName && entry.active !== false) {
          await saveDriverSession(
            hash,
            entry.displayName,
            hash,
            entry.isAdmin === true,
            entry.isViewer === true,
            entry.companyId,
            entry.companyName
          );
          const driverSession = await getDriverSession();
          setSession(driverSession);
          setMode("authenticated");
          return true;
        }
      }

      return false;
    } catch (err) {
      console.error("[AuthContext-JSA] SSO login error:", err);
      return false;
    }
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
