// app/login.tsx
// Login / Registration screen for WB JSA
// Same auth flow as WB S: name + passcode → SHA-256 → Firebase RTDB lookup
// Supports: login, register, pending approval, approved, rejected, error states

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "../constants/colors";
import { useAuth, AuthMode } from "../app/contexts/AuthContext";
import { useLanguage } from "../app/contexts/LanguageContext";

// Passcode validation
const VALID_PASSCODE_REGEX = /^[a-zA-Z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+$/;

const validatePasscode = (code: string): { valid: boolean; error?: string } => {
  if (!code.trim()) return { valid: false, error: "Please create a passcode" };
  if (code.length < 4) return { valid: false, error: "Passcode must be at least 4 characters" };
  if (code.length > 12) return { valid: false, error: "Passcode must be 12 characters or less" };
  if (!VALID_PASSCODE_REGEX.test(code)) return { valid: false, error: "Passcode contains invalid characters" };
  return { valid: true };
};

export default function LoginScreen() {
  const { t } = useLanguage();
  const {
    mode,
    error,
    pendingName,
    login,
    register,
    completeReg,
    cancelRegistration,
    switchToRegister,
    switchToLogin,
    tryAgain,
  } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [passcodeError, setPasscodeError] = useState("");

  // Validate passcode as user types (register mode only)
  useEffect(() => {
    if (mode === "register" && passcode.length > 0) {
      const validation = validatePasscode(passcode);
      if (!validation.valid && validation.error?.includes("invalid characters")) {
        setPasscodeError(validation.error);
      } else {
        setPasscodeError("");
      }
    } else {
      setPasscodeError("");
    }
  }, [passcode, mode]);

  const canSubmit =
    mode === "register"
      ? !!(passcode.trim() && displayName.trim() && companyName.trim() && !passcodeError)
      : !!(passcode.trim() && displayName.trim() && !passcodeError);

  const handleLogin = async () => {
    if (!displayName.trim() || !passcode.trim()) return;
    await login(displayName, passcode);
  };

  const handleRegister = async () => {
    const validation = validatePasscode(passcode);
    if (!validation.valid) return;
    if (!displayName.trim() || !companyName.trim()) return;
    await register(displayName, passcode, companyName);
  };

  const handleSwitchToRegister = () => {
    setPasscode("");
    setCompanyName("");
    setShowPasscode(false);
    switchToRegister();
  };

  const handleSwitchToLogin = () => {
    setPasscode("");
    setCompanyName("");
    setShowPasscode(false);
    switchToLogin();
  };

  // --- Loading / Checking state ---
  if (mode === "checking") {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // --- Verifying / Registering state ---
  if (mode === "verifying" || mode === "registering") {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>
          {mode === "verifying" ? "Verifying your passcode..." : "Submitting your registration..."}
        </Text>
      </View>
    );
  }

  // --- Pending approval ---
  if (mode === "pending") {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="clock-outline" size={64} color={colors.primary} />
        <Text style={styles.statusTitle}>Registration Pending</Text>
        <Text style={styles.statusMessage}>
          Your registration as "{pendingName}" is waiting for approval.
        </Text>
        <Text style={styles.statusSubtext}>An administrator will review your request shortly.</Text>
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
        <Text style={[styles.statusSubtext, { marginTop: 8 }]}>Checking for approval...</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={cancelRegistration}>
          <Text style={styles.secondaryButtonText}>Cancel registration</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Approved ---
  if (mode === "approved") {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="check-circle-outline" size={64} color={colors.success} />
        <Text style={styles.statusTitle}>Registration Approved!</Text>
        <Text style={styles.statusMessage}>
          Welcome, {pendingName}! Your registration has been approved.
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={completeReg}>
          <Text style={styles.primaryButtonText}>Continue to App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Rejected ---
  if (mode === "rejected") {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="close-circle-outline" size={64} color={colors.error} />
        <Text style={styles.statusTitle}>Access Denied</Text>
        <Text style={styles.statusMessage}>Your registration request was denied.</Text>
        <Text style={styles.statusSubtext}>
          If you believe this is a mistake, contact an administrator.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => {
            cancelRegistration();
          }}
        >
          <Text style={styles.primaryButtonText}>Start Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Error ---
  if (mode === "error") {
    return (
      <View style={styles.centerContainer}>
        <MaterialCommunityIcons name="alert-circle-outline" size={64} color={colors.error} />
        <Text style={styles.statusTitle}>Sign In Failed</Text>
        <Text style={styles.statusMessage}>{error || "Could not sign in"}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={tryAgain}>
          <Text style={styles.primaryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- Login / Register form ---
  const isRegister = mode === "register";

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerSection}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={48}
              color={colors.primary}
            />
            <Text style={styles.title}>
              {isRegister ? "New Driver Registration" : "Job Safety Analysis"}
            </Text>
            <Text style={styles.subtitle}>
              {isRegister
                ? "Enter your info to register with your company"
                : "Enter your name and passcode to sign in"}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formSection}>
            {/* Display Name */}
            <Text style={styles.label}>
              {isRegister ? "Display Name" : "Your Name"}
            </Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder={isRegister ? "Display name (e.g., MBurger)" : "Your name"}
              placeholderTextColor="#999"
              autoCapitalize="words"
              returnKeyType="next"
            />

            {/* Company Name (register only) */}
            {isRegister && (
              <>
                <Text style={styles.label}>Company</Text>
                <TextInput
                  style={styles.input}
                  value={companyName}
                  onChangeText={setCompanyName}
                  placeholder="Your company name"
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                  returnKeyType="next"
                />
                <Text style={styles.hint}>Enter the company name your employer gave you</Text>
              </>
            )}

            {/* Passcode */}
            <Text style={styles.label}>
              {isRegister ? "Create Passcode" : "Passcode"}
            </Text>
            <View style={styles.passcodeRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={passcode}
                onChangeText={setPasscode}
                placeholder={isRegister ? "Create a passcode" : "Your passcode"}
                placeholderTextColor="#999"
                secureTextEntry={!showPasscode}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={isRegister ? handleRegister : handleLogin}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPasscode(!showPasscode)}
              >
                <MaterialCommunityIcons
                  name={showPasscode ? "eye-off" : "eye"}
                  size={22}
                  color={colors.textMuted}
                />
              </TouchableOpacity>
            </View>
            {isRegister && <Text style={styles.hint}>4-12 characters</Text>}
            {passcodeError ? <Text style={styles.errorText}>{passcodeError}</Text> : null}

            {/* Error message */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Submit button */}
            <TouchableOpacity
              style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
              onPress={isRegister ? handleRegister : handleLogin}
              disabled={!canSubmit}
            >
              <Text style={styles.primaryButtonText}>
                {isRegister ? "Submit Registration" : "Sign In"}
              </Text>
            </TouchableOpacity>

            {/* Registration approval note */}
            {isRegister && (
              <Text style={styles.approvalNote}>
                Your registration will need to be approved by an administrator.
              </Text>
            )}

            {/* Toggle login/register */}
            <View style={styles.toggleRow}>
              <Text style={styles.toggleText}>
                {isRegister ? "Already registered?" : "New driver?"}
              </Text>
              <TouchableOpacity onPress={isRegister ? handleSwitchToLogin : handleSwitchToRegister}>
                <Text style={styles.toggleLink}>
                  {isRegister ? "Sign in" : "Register here"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.textDark,
    marginTop: 12,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  formSection: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
    marginBottom: 6,
    marginTop: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: colors.textDark,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passcodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  eyeButton: {
    padding: 10,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    color: colors.error,
    marginTop: 8,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  disabledButton: {
    opacity: 0.5,
  },
  secondaryButton: {
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  approvalNote: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    gap: 4,
  },
  toggleText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  toggleLink: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
  },
  // Status screens
  statusTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.textDark,
    marginTop: 16,
    textAlign: "center",
  },
  statusMessage: {
    fontSize: 15,
    color: colors.textDark,
    marginTop: 8,
    textAlign: "center",
    lineHeight: 22,
  },
  statusSubtext: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  loadingText: {
    fontSize: 15,
    color: colors.textMuted,
    marginTop: 16,
    textAlign: "center",
  },
});
