// Shared type definitions for JSA data structures

export type WellEntry = {
  name: string;
  operator?: string;
  county?: string;
  jobType: string;
  source?: 'ndic' | 'manual' | 'stamp'; // how the well was added
  addedAt?: string; // ISO timestamp
};

export type LocationStamp = {
  name: string;
  type: 'pickup' | 'dropoff';
  jobType?: string;
  stampedAt: string;
  dispatchId?: string;
};

/** Canonical JSA record — used for saving, display, and PDF generation */
export type JSARecord = {
  id: string;
  timestamp: string;
  driverName: string;
  truckNumber: string;
  trailerNumber?: string;
  jobActivityName: string;
  pusher: string;
  wells: WellEntry[];
  otherInfo: string;
  date: string;
  ppeSelected: Record<string, boolean>;
  ppeOtherItems?: string[];
  locations: string[];
  locationStamps?: LocationStamp[];
  locationAcks: Record<string, boolean>;
  prepared: Record<string, boolean>;
  notes: string;
  signature: string;          // typed name
  signatureImage?: string;    // base64 PNG
  companyId?: string;
  driverHash?: string;
};

/** Normalize old HistoryItem format to new JSARecord */
export function normalizeJsaRecord(raw: any): JSARecord {
  // Handle wells — old format has wellName (string), new has wells (WellEntry[])
  let wells: WellEntry[] = [];
  if (Array.isArray(raw.wells)) {
    wells = raw.wells.map((w: any) => {
      if (typeof w === 'string') {
        return { name: w, jobType: raw.jobActivityName || raw.task || '', source: 'ndic' as const };
      }
      return w;
    });
  } else if (raw.wellName && typeof raw.wellName === 'string' && raw.wellName !== '-') {
    wells = [{ name: raw.wellName, jobType: raw.jobActivityName || raw.task || '', source: 'ndic' as const }];
  }

  // Handle PPE — old format is JSON string, new is object
  let ppeSelected: Record<string, boolean> = {};
  if (typeof raw.ppeSelected === 'string') {
    try {
      const parsed = JSON.parse(raw.ppeSelected);
      if (parsed?.selected) ppeSelected = parsed.selected;
      else if (typeof parsed === 'object' && !Array.isArray(parsed)) ppeSelected = parsed;
    } catch {}
  } else if (raw.ppeSelected && typeof raw.ppeSelected === 'object') {
    ppeSelected = raw.ppeSelected;
  }

  // Handle PPE other items
  let ppeOtherItems: string[] = [];
  if (typeof raw.ppeSelected === 'string') {
    try {
      const parsed = JSON.parse(raw.ppeSelected);
      if (parsed?.otherItems && Array.isArray(parsed.otherItems)) ppeOtherItems = parsed.otherItems;
    } catch {}
  }

  // Handle locations
  let locations: string[] = [];
  if (Array.isArray(raw.locations)) {
    locations = raw.locations;
  } else if (typeof raw.locations === 'string') {
    try {
      const parsed = JSON.parse(raw.locations);
      if (Array.isArray(parsed)) locations = parsed;
    } catch {}
  }

  // Handle locationAcks
  let locationAcks: Record<string, boolean> = {};
  if (typeof raw.locationAcks === 'string') {
    try {
      const parsed = JSON.parse(raw.locationAcks);
      if (parsed && typeof parsed === 'object') locationAcks = parsed;
    } catch {}
  } else if (raw.locationAcks && typeof raw.locationAcks === 'object') {
    locationAcks = raw.locationAcks;
  }

  // Handle prepared
  let prepared: Record<string, boolean> = {};
  if (typeof raw.prepared === 'string') {
    try {
      const parsed = JSON.parse(raw.prepared);
      if (parsed && typeof parsed === 'object') prepared = parsed;
    } catch {}
  } else if (raw.prepared && typeof raw.prepared === 'object') {
    prepared = raw.prepared;
  }

  return {
    id: raw.id || Date.now().toString(),
    timestamp: raw.timestamp || new Date().toISOString(),
    driverName: raw.driverName || '',
    truckNumber: raw.truckNumber || '',
    trailerNumber: raw.trailerNumber || '',
    jobActivityName: raw.jobActivityName || raw.task || '',
    pusher: raw.pusher || '',
    wells,
    otherInfo: raw.otherInfo || '',
    date: raw.date || '',
    ppeSelected,
    ppeOtherItems,
    locations,
    locationStamps: raw.locationStamps || [],
    locationAcks,
    prepared,
    notes: raw.notes || '',
    signature: raw.signature || '',
    signatureImage: raw.signatureImage || '',
    companyId: raw.companyId || '',
    driverHash: raw.driverHash || '',
  };
}

// --- Legacy types (kept for backward compat during migration) ---

export type JSAParams = {
  id?: string;
  sessionId?: string;
  driverName?: string;
  truckNumber?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
  wells?: string;
  otherInfo?: string;
  location?: string;
  task?: string;
  jsaType?: string;
  date?: string;
  ppeSelected?: string;
  locations?: string;
  locationAcks?: string;
  prepared?: string;
  notes?: string;
  signature?: string;
  signatureImage?: string;
  savedAt?: string;
  timestamp?: string;
  editMode?: string;
};

/** @deprecated Use JSARecord instead */
export type HistoryItem = {
  id: string;
  timestamp: string;
  driverName: string;
  truckNumber: string;
  jobActivityName: string;
  pusher: string;
  wellName: string;
  wells?: any[];
  otherInfo: string;
  location: string;
  task: string;
  date: string;
  ppeSelected: string | Record<string, boolean>;
  locations: string[];
  locationAcks: Record<string, boolean>;
  prepared: Record<string, boolean>;
  notes: string;
  signature: string;
  signatureImage?: string;
};

export type SummaryField = {
  label: string;
  value: string;
};
