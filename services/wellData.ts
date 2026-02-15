// services/wellData.ts
// Lightweight NDIC well data access for JSA app
// Reads from the same Firestore collections as WB Tickets (wellbuilt-sync)

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from './firebase';

// ── Types ───────────────────────────────────────────────────────────────────

export type WellRecord = {
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

    const snapshot = await getDocs(
      query(collection(db, 'operators'), orderBy('name'))
    );
    operatorsCache = snapshot.docs.map((d) => d.data() as OperatorRecord);
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
    const snapshot = await getDocs(
      query(
        collection(db, 'wells'),
        where('operator', '==', operator),
        orderBy('well_name')
      )
    );
    return snapshot.docs.map((d) => d.data() as WellRecord);
  } catch (err) {
    console.warn('[wellData] Failed to load wells for operator:', err);
    return [];
  }
};

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
  if (terms.length === 0 || searchText.trim().length < 3) return [];

  const scored: { well: WellRecord; score: number }[] = [];

  for (const well of allWellsCache) {
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
  return scored.slice(0, maxResults).map((s) => s.well);
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
