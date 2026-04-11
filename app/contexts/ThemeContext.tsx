// app/contexts/ThemeContext.tsx
// Dynamic company branding for WB JSA.
// Loads company config from Firestore REST API (same pattern as WB T ThemeContext).
// Provides accent color, logo URL, company name, address, phone, and contacts.
// Falls back to WellBuilt defaults when no company config is set.

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./AuthContext";

// --- Interfaces ---

// BYOJSA: Company-specific JSA template loaded from Firestore
export interface JsaTemplateData {
  name: string;
  steps: { id: string; title: string; items: { hazard: string; controls: string }[] }[];
  ppeItems: { id: string; label: string }[];
  preparedItems: { id: string; label: string }[];
  version: number;
}

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
  activePackages?: string[];
  customJobTypes?: { label: string; packages: string[] }[];
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
  /** Company-specific JSA template (null = use hardcoded default) */
  jsaTemplate: JsaTemplateData | null;
  /** Job types available for this company (standard + custom) */
  jobTypes: string[];
  /** Whether config is still loading */
  loading: boolean;
  /** Whether company config has loaded at least once (false on initial render) */
  configLoaded: boolean;
  /** Force refresh company config */
  refresh: () => Promise<void>;
}

// Defaults
const DEFAULT_ACCENT = "#F5A623"; // WellBuilt gold
const DEFAULT_COMPANY_NAME = "WellBuilt";
const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents";
const CACHE_KEY = "@jsa/companyConfig";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Standard job types (matches WB T / Dashboard)
const STANDARD_JOB_TYPES = [
  'Production Water', 'Fresh Water', 'Flowback Water', 'Pit Water',
  'Invert', 'Service Work', 'Vac Work', 'Pushers', 'Rig Work',
  'Fuel Service', 'Other',
];

/** Build job type list: standard + company custom types */
function buildJobTypes(config: CompanyConfig | null): string[] {
  const types = [...STANDARD_JOB_TYPES];
  if (config?.customJobTypes?.length) {
    for (const ct of config.customJobTypes) {
      if (!types.some(t => t.toLowerCase() === ct.label.toLowerCase())) {
        types.push(ct.label);
      }
    }
  }
  return types;
}

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

  // Parse activePackages array
  if (fields.activePackages?.arrayValue?.values) {
    config.activePackages = fields.activePackages.arrayValue.values
      .map((v: any) => v.stringValue)
      .filter(Boolean);
  }

  // Parse customJobTypes array of maps
  if (fields.customJobTypes?.arrayValue?.values) {
    config.customJobTypes = fields.customJobTypes.arrayValue.values
      .map((v: any) => {
        const m = v.mapValue?.fields;
        if (m?.label?.stringValue) {
          const pkgs = m.packages?.arrayValue?.values?.map((p: any) => p.stringValue).filter(Boolean) || [];
          return { label: m.label.stringValue, packages: pkgs };
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

/**
 * Fetch company JSA template from Firestore REST API
 */
async function fetchJsaTemplate(companyId: string): Promise<JsaTemplateData | null> {
  try {
    const url = `${FIRESTORE_BASE}/jsa_templates/${companyId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;

    const doc = await response.json();
    const fields = doc?.fields;
    if (!fields) return null;

    // Only use active templates
    if (fields.status?.stringValue !== 'active') return null;

    // Parse steps array
    const steps = (fields.steps?.arrayValue?.values || []).map((v: any) => {
      const m = v.mapValue?.fields;
      if (!m) return null;
      const items = (m.items?.arrayValue?.values || []).map((iv: any) => {
        const im = iv.mapValue?.fields;
        return im ? {
          hazard: im.hazard?.stringValue || '',
          controls: im.controls?.stringValue || '',
        } : null;
      }).filter(Boolean);
      return {
        id: m.id?.stringValue || '',
        title: m.title?.stringValue || '',
        items,
      };
    }).filter(Boolean);

    if (steps.length === 0) return null;

    // Parse PPE items
    const ppeItems = (fields.ppeItems?.arrayValue?.values || []).map((v: any) => {
      const m = v.mapValue?.fields;
      return m ? { id: m.id?.stringValue || '', label: m.label?.stringValue || '' } : null;
    }).filter(Boolean);

    // Parse prepared items
    const preparedItems = (fields.preparedItems?.arrayValue?.values || []).map((v: any) => {
      const m = v.mapValue?.fields;
      return m ? { id: m.id?.stringValue || '', label: m.label?.stringValue || '' } : null;
    }).filter(Boolean);

    return {
      name: fields.name?.stringValue || 'Custom JSA',
      steps,
      ppeItems,
      preparedItems,
      version: parseInt(fields.version?.integerValue || '1', 10),
    };
  } catch (err) {
    console.error("[ThemeContext-JSA] Error fetching JSA template:", err);
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const companyId = session?.companyId;

  const [config, setConfig] = useState<CompanyConfig | null>(null);
  const [jsaTemplate, setJsaTemplate] = useState<JsaTemplateData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => {
    if (!companyId) {
      setConfig(null);
      setJsaTemplate(null);
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
          setJsaTemplate(parsed.jsaTemplate || null);
          setLoading(false);
          // Still fetch fresh in background
          Promise.all([
            fetchCompanyConfig(companyId),
            fetchJsaTemplate(companyId),
          ]).then(([freshConfig, freshTemplate]) => {
            if (freshConfig) setConfig(freshConfig);
            setJsaTemplate(freshTemplate);
            AsyncStorage.setItem(
              CACHE_KEY,
              JSON.stringify({ companyId, config: freshConfig || parsed.config, jsaTemplate: freshTemplate, timestamp: Date.now() })
            ).catch(() => {});
          });
          return;
        }
      }

      // Fetch fresh
      const [fresh, freshTemplate] = await Promise.all([
        fetchCompanyConfig(companyId),
        fetchJsaTemplate(companyId),
      ]);
      if (fresh) setConfig(fresh);
      setJsaTemplate(freshTemplate);
      await AsyncStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ companyId, config: fresh, jsaTemplate: freshTemplate, timestamp: Date.now() })
      ).catch(() => {});
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
      jsaTemplate,
      jobTypes: buildJobTypes(config),
      loading,
      configLoaded: !loading && (config !== null || !companyId),
      refresh: loadConfig,
    };
  }, [config, jsaTemplate, loading, session?.companyName, companyId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
