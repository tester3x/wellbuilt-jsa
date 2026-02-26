// app/contexts/ThemeContext.tsx
// Dynamic company branding for WB JSA.
// Loads company config from Firestore REST API (same pattern as WB T ThemeContext).
// Provides accent color, logo URL, company name, address, phone, and contacts.
// Falls back to WellBuilt defaults when no company config is set.

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";

// --- Interfaces ---

interface CompanyConfig {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  primaryColor?: string;
  logoUrl?: string;
  assignedOperators?: string[];
  emergencyContacts?: { label: string; phone: string }[];
  companyContacts?: { label: string; phone: string }[];
}

interface ThemeContextValue {
  /** Accent color — company primary or WellBuilt gold fallback */
  accent: string;
  /** Dimmed accent (20% opacity) for backgrounds */
  accentDim: string;
  /** Company logo URL (or null for default) */
  logoUrl: string | null;
  /** Company name */
  companyName: string;
  /** Full company address */
  companyAddress: string;
  /** Company phone */
  companyPhone: string;
  /** Assigned operators for company-scoped well loading */
  assignedOperators: string[];
  /** Emergency contacts from company config */
  emergencyContacts: { label: string; phone: string }[];
  /** Company contacts from company config */
  companyContacts: { label: string; phone: string }[];
  /** Whether config is still loading */
  loading: boolean;
  /** Force refresh company config */
  refresh: () => Promise<void>;
}

// Defaults
const DEFAULT_ACCENT = "#F5A623"; // WellBuilt gold
const DEFAULT_COMPANY_NAME = "WellBuilt";
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents";
const CACHE_KEY = "@jsa/companyConfig";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Build full address from company config fields
 */
function buildFullAddress(config: CompanyConfig): string {
  const parts: string[] = [];
  if (config.address) parts.push(config.address);
  const cityStateZip: string[] = [];
  if (config.city) cityStateZip.push(config.city);
  if (config.state) cityStateZip.push(config.state);
  if (config.zip) cityStateZip.push(config.zip);
  if (cityStateZip.length > 0) parts.push(cityStateZip.join(", "));
  return parts.join("\n");
}

/**
 * Parse Firestore REST response into CompanyConfig
 */
function parseFirestoreDoc(doc: any): CompanyConfig {
  const fields = doc?.fields || {};
  const config: CompanyConfig = {};

  if (fields.name?.stringValue) config.name = fields.name.stringValue;
  if (fields.address?.stringValue) config.address = fields.address.stringValue;
  if (fields.city?.stringValue) config.city = fields.city.stringValue;
  if (fields.state?.stringValue) config.state = fields.state.stringValue;
  if (fields.zip?.stringValue) config.zip = fields.zip.stringValue;
  if (fields.phone?.stringValue) config.phone = fields.phone.stringValue;
  if (fields.primaryColor?.stringValue) config.primaryColor = fields.primaryColor.stringValue;
  if (fields.logoUrl?.stringValue) config.logoUrl = fields.logoUrl.stringValue;

  // Parse assignedOperators array
  if (fields.assignedOperators?.arrayValue?.values) {
    config.assignedOperators = fields.assignedOperators.arrayValue.values
      .map((v: any) => v.stringValue)
      .filter(Boolean);
  }

  // Parse emergencyContacts array of maps
  if (fields.emergencyContacts?.arrayValue?.values) {
    config.emergencyContacts = fields.emergencyContacts.arrayValue.values
      .map((v: any) => {
        const m = v.mapValue?.fields;
        if (m?.label?.stringValue && m?.phone?.stringValue) {
          return { label: m.label.stringValue, phone: m.phone.stringValue };
        }
        return null;
      })
      .filter(Boolean);
  }

  // Parse companyContacts array of maps
  if (fields.companyContacts?.arrayValue?.values) {
    config.companyContacts = fields.companyContacts.arrayValue.values
      .map((v: any) => {
        const m = v.mapValue?.fields;
        if (m?.label?.stringValue && m?.phone?.stringValue) {
          return { label: m.label.stringValue, phone: m.phone.stringValue };
        }
        return null;
      })
      .filter(Boolean);
  }

  return config;
}

/**
 * Fetch company config from Firestore REST API
 */
async function fetchCompanyConfig(companyId: string): Promise<CompanyConfig | null> {
  try {
    const url = `${FIRESTORE_BASE}/companies/${companyId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn("[ThemeContext-JSA] Firestore fetch failed:", response.status);
      return null;
    }

    const doc = await response.json();
    return parseFirestoreDoc(doc);
  } catch (err) {
    console.error("[ThemeContext-JSA] Error fetching company config:", err);
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => {
    if (!companyId) {
      setConfig(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // Check cache first
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.companyId === companyId && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
          setConfig(parsed.config);
          setLoading(false);
          // Still fetch fresh in background
          fetchCompanyConfig(companyId).then((fresh) => {
            if (fresh) {
              setConfig(fresh);
              AsyncStorage.setItem(
                CACHE_KEY,
                JSON.stringify({ companyId, config: fresh, timestamp: Date.now() })
              ).catch(() => {});
            }
          });
          return;
        }
      }

      // Fetch fresh
      const fresh = await fetchCompanyConfig(companyId);
      if (fresh) {
        setConfig(fresh);
        await AsyncStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ companyId, config: fresh, timestamp: Date.now() })
        ).catch(() => {});
      }
    } catch (err) {
      console.error("[ThemeContext-JSA] Error loading config:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [companyId]);

  const value = useMemo<ThemeContextValue>(() => {
    const accent = config?.primaryColor || DEFAULT_ACCENT;
    // Create dimmed version by appending hex opacity
    const accentDim = accent + "20";

    return {
      accent,
      accentDim,
      logoUrl: config?.logoUrl || null,
      companyName: config?.name || session?.companyName || DEFAULT_COMPANY_NAME,
      companyAddress: config ? buildFullAddress(config) : "",
      companyPhone: config?.phone || "",
      assignedOperators: config?.assignedOperators || [],
      emergencyContacts: config?.emergencyContacts || [],
      companyContacts: config?.companyContacts || [],
      loading,
      refresh: loadConfig,
    };
  }, [config, loading, session?.companyName]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
