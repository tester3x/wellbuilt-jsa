// services/wellData.ts
// Lightweight NDIC well data access for JSA app
// Reads from the same Firestore collections as WB Tickets (wellbuilt-sync)

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';

import { db } from './firebase';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

async function loadCatalog(params: { type: 'operators' | 'wells' | 'disposals'; operator?: string }): Promise<any[]> {
  const { loadUsableGovernedSession } = await import('./sso/jsaGovernedAuthLive');
  const owner = await loadUsableGovernedSession();
  if (!owner) throw new Error('catalog_authentication_required');
  const result = await httpsCallable(getFunctions(getApp(), 'us-central1'), 'getWellData', { timeout: 15000 })(params);
  const current = await loadUsableGovernedSession();
  if (!current || current.uid !== owner.uid || current.generation !== owner.generation) throw new Error('catalog_account_changed');
  if (!Array.isArray(result.data)) throw new Error('catalog_invalid_response');
  return result.data;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type WellRecord = {
  locationKind?: 'swd';
  well_name: string;
  operator: string;
  api_no: string;
  latitude: number;
  longitude: number;
  county: string;
  field_name: string;
  legal_desc: string;
  search_name: string;
  search_operator: string;
};

export type OperatorRecord = {
  name: string;
  well_count: number;
  search_name: string;
};

export type OperatorAlias = {
  alias: string;
  operators: string[];
};

// ── Cache keys & TTL ────────────────────────────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEYS = {
  operators: 'jsa_wellData_operators',
  aliases: 'jsa_wellData_aliases',
  allWells: 'jsa_wellData_allWells',
  timestamps: 'jsa_wellData_timestamps',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const isCacheFresh = async (key: string): Promise<boolean> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.timestamps);
    if (!raw) return false;
    const timestamps = JSON.parse(raw);
    const ts = timestamps[key];
    return ts && Date.now() - ts < CACHE_TTL;
  } catch {
    return false;
  }
};

const setCacheTimestamp = async (key: string): Promise<void> => {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.timestamps);
    const timestamps = raw ? JSON.parse(raw) : {};
    timestamps[key] = Date.now();
    await AsyncStorage.setItem(CACHE_KEYS.timestamps, JSON.stringify(timestamps));
  } catch {
    // silent
  }
};

// ── Loaders ─────────────────────────────────────────────────────────────────

let operatorsCache: OperatorRecord[] = [];
let aliasesCache: OperatorAlias[] = [];
let allWellsCache: WellRecord[] = [];
let disposalsCache: WellRecord[] = [];

/** Shared WB-T SWD catalog; available even without assigned well operators. */
export const loadDisposals = async (): Promise<WellRecord[]> => {
  if (disposalsCache.length) return disposalsCache;
  const key = 'jsa_wellData_disposals';
  const cached = await AsyncStorage.getItem(key).catch(() => null);
  if (cached) {
    try { const rows = JSON.parse(cached); if (Array.isArray(rows)) disposalsCache = rows; } catch {}
  }
  if (disposalsCache.length && await isCacheFresh(key)) return disposalsCache;
  try {
    disposalsCache = (await loadCatalog({ type: 'disposals' })).map(w => ({ ...w, locationKind: 'swd' as const }));
    await AsyncStorage.setItem(key, JSON.stringify(disposalsCache));
    await setCacheTimestamp(key);
  } catch (error) {
    if (!disposalsCache.length) throw error;
  }
  return disposalsCache;
};

/**
 * Load all NDIC operators from Firestore (cached 24hr).
 */
export const loadOperators = async (): Promise<OperatorRecord[]> => {
  if (operatorsCache.length > 0) return operatorsCache;

  try {
    if (await isCacheFresh('operators')) {
      const raw = await AsyncStorage.getItem(CACHE_KEYS.operators);
      if (raw) {
        operatorsCache = JSON.parse(raw);
        return operatorsCache;
      }
    }

    operatorsCache = await loadCatalog({ type: 'operators' });
    await AsyncStorage.setItem(CACHE_KEYS.operators, JSON.stringify(operatorsCache));
    await setCacheTimestamp('operators');
    return operatorsCache;
  } catch (err) {
    console.warn('[wellData] Failed to load operators:', err);
    return operatorsCache;
  }
};

/**
 * Load operator aliases (DBA / common names → NDIC names).
 */
export const loadAliases = async (): Promise<OperatorAlias[]> => {
  if (aliasesCache.length > 0) return aliasesCache;

  try {
    if (await isCacheFresh('aliases')) {
      const raw = await AsyncStorage.getItem(CACHE_KEYS.aliases);
      if (raw) {
        aliasesCache = JSON.parse(raw);
        return aliasesCache;
      }
    }

    const snapshot = await getDocs(collection(db, 'operatorAliases'));
    aliasesCache = snapshot.docs.map((d) => d.data() as OperatorAlias);
    await AsyncStorage.setItem(CACHE_KEYS.aliases, JSON.stringify(aliasesCache));
    await setCacheTimestamp('aliases');
    return aliasesCache;
  } catch (err) {
    console.warn('[wellData] Failed to load aliases:', err);
    return aliasesCache;
  }
};

/**
 * Load ALL wells (~19k). Heavy but enables global search.
 * Cached in AsyncStorage for 24hr.
 */
export const loadAllWells = async (): Promise<WellRecord[]> => {
  if (allWellsCache.length > 0) return allWellsCache;

  try {
    if (await isCacheFresh('allWells')) {
      const raw = await AsyncStorage.getItem(CACHE_KEYS.allWells);
      if (raw) {
        allWellsCache = JSON.parse(raw);
        return allWellsCache;
      }
    }

    // Load all wells in one go — ~19k docs, cached for 24hr
    const snapshot = await getDocs(
      query(collection(db, 'wells'), orderBy('well_name'))
    );
    allWellsCache = snapshot.docs.map((d) => d.data() as WellRecord);
    await AsyncStorage.setItem(CACHE_KEYS.allWells, JSON.stringify(allWellsCache));
    await setCacheTimestamp('allWells');
    return allWellsCache;
  } catch (err) {
    console.warn('[wellData] Failed to load all wells:', err);
    return allWellsCache;
  }
};

/**
 * Load wells for a specific operator from Firestore.
 */
export const loadWellsForOperator = async (operator: string): Promise<WellRecord[]> => {
  try {
    return await loadCatalog({ type: 'wells', operator });
  } catch (err) {
    console.warn('[wellData] Failed to load wells for operator:', err);
    throw err;
  }
};

// ── Company-scoped loading ──────────────────────────────────────────────────
// Same pattern as WB T: load only wells for company's assigned operators.
// Falls back to loadAllWells() if no operators provided.

let companyWellsCache: WellRecord[] = [];
let companyWellsLoaded = false;
let companyOperatorsKey = '';
let companyLoadEpoch = 0;

/**
 * Pre-load wells for the company's assigned operators.
 * ~200-400 wells instead of 19k. Caches per-operator in AsyncStorage (24hr TTL).
 */
export const preloadCompanyWells = async (
  operatorNames: string[]
): Promise<WellRecord[]> => {
  const operatorKey = JSON.stringify([...new Set(operatorNames || [])].sort());
  if (companyWellsLoaded && companyOperatorsKey === operatorKey && companyWellsCache.length > 0) return companyWellsCache;
  const loadEpoch = ++companyLoadEpoch;
  companyOperatorsKey = operatorKey;
  allWellsCache = [];

  if (!operatorNames || operatorNames.length === 0) {
    // No operators assigned — return empty. Driver types well names manually or
    // picks oil companies in Settings to enable autocomplete. We never load the
    // full 19k well list (3–4 minute wait, terrible UX).
    console.log('[wellData-JSA] No assigned well operators; SWD search remains separate');
    companyWellsCache = [];
    companyWellsLoaded = true;
    return companyWellsCache;
  }

  console.log('[wellData-JSA] Pre-loading wells for operators:', operatorNames);
  const allWells: WellRecord[] = [];

  // Also resolve aliases — some company configs use DBA names
  // Alias enrichment must not block authenticated catalog reads on an older
  // direct-Firestore permission or an offline SDK request.
  let aliases = aliasesCache;
  if (!aliases.length) {
    try {
      const cachedAliases = JSON.parse(await AsyncStorage.getItem(CACHE_KEYS.aliases) || '[]');
      if (Array.isArray(cachedAliases)) aliases = cachedAliases;
    } catch {}
  }
  let failed = false;
  const resolvedOperators = new Set<string>();
  for (const name of operatorNames) {
    resolvedOperators.add(name);
    // Check if this name is an alias
    for (const alias of aliases) {
      if (alias.alias.toLowerCase() === name.toLowerCase()) {
        alias.operators.forEach((op) => resolvedOperators.add(op));
      }
    }
  }

  for (const operator of resolvedOperators) {
    const cacheKey = `jsa_companyWells_${operator.replace(/\s+/g, '_')}`;
    try {
      // Check per-operator cache
      if (await isCacheFresh(cacheKey)) {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) {
          const wells = JSON.parse(raw) as WellRecord[];
          if (wells.length) {
            allWells.push(...wells);
            continue;
          }
        }
      }

      // Fetch from Firestore
      const wells = await loadWellsForOperator(operator);
      allWells.push(...wells);

      // Cache per-operator
      await AsyncStorage.setItem(cacheKey, JSON.stringify(wells));
      await setCacheTimestamp(cacheKey);
    } catch (err) {
      failed = true;
      console.warn(`[wellData-JSA] Failed to load wells for ${operator}:`, err);
    }
  }

  if (loadEpoch !== companyLoadEpoch) return [];
  companyWellsCache = allWells;
  companyWellsLoaded = !failed;
  // Also populate allWellsCache so searchWells() works
  allWellsCache = allWells;
  console.log(`[wellData-JSA] Pre-loaded ${allWells.length} wells for ${resolvedOperators.size} operators`);
  if (failed) throw new Error('catalog_wells_incomplete');
  return companyWellsCache;
};

/**
 * Search across pre-loaded company wells.
 */
export const searchCompanyWells = (
  searchQuery: string,
  maxResults = 10
): WellRecord[] => {
  // searchWells() already searches allWellsCache which we populated
  return searchWells(searchQuery, maxResults);
};

/**
 * Check if company wells have been pre-loaded.
 */
export const isCompanyWellsLoaded = (): boolean => companyWellsLoaded;

// ── Search ──────────────────────────────────────────────────────────────────

// Noise words to strip from search queries
const NOISE_WORDS = new Set([
  'the', 'and', 'oil', 'gas', 'inc', 'llc', 'corp', 'company', 'co',
  'energy', 'resources', 'operating', 'production', 'petroleum',
]);

const normalizeSearch = (text: string): string[] => {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NOISE_WORDS.has(w));
};

/**
 * Search wells globally by name. Requires 3+ characters.
 * Returns max 10 results sorted by relevance.
 */
export const searchWells = (searchText: string, maxResults = 10): WellRecord[] => {
  const terms = normalizeSearch(searchText);
  if (terms.length === 0 || searchText.trim().length < 2) return [];

  const scored: { well: WellRecord; score: number }[] = [];

  const seen = new Set<string>();
  for (const well of [...disposalsCache, ...allWellsCache]) {
    const key = well.api_no || `${well.well_name}|${well.operator}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (well.search_name || well.well_name || '').toLowerCase();
    const op = (well.search_operator || well.operator || '').toLowerCase();
    const combined = `${name} ${op}`;

    let matchCount = 0;
    for (const term of terms) {
      if (combined.includes(term)) matchCount++;
    }

    if (matchCount === terms.length) {
      // Prefer exact prefix matches
      const startsWithFirst = name.startsWith(terms[0]) ? 1 : 0;
      scored.push({ well, score: matchCount + startsWithFirst });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return (maxResults > 0 ? scored.slice(0, maxResults) : scored).map((s) => s.well);
};

/**
 * Search operators by name. Returns max 10 results.
 */
export const searchOperators = (searchText: string, maxResults = 10): OperatorRecord[] => {
  const terms = normalizeSearch(searchText);
  if (terms.length === 0) return [];

  const results: OperatorRecord[] = [];

  for (const op of operatorsCache) {
    const name = (op.search_name || op.name || '').toLowerCase();
    let allMatch = true;
    for (const term of terms) {
      if (!name.includes(term)) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      results.push(op);
      if (results.length >= maxResults) break;
    }
  }

  return results;
};
