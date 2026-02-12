// Shared type definitions for JSA data structures

export type JSAParams = {
  id?: string;
  sessionId?: string;
  driverName?: string;
  truckNumber?: string;
  jobActivityName?: string;
  pusher?: string;
  wellName?: string;
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
  savedAt?: string;
  timestamp?: string;
  editMode?: string;
};

export type HistoryItem = {
  id: string;
  timestamp: string;
  driverName: string;
  truckNumber: string;
  jobActivityName: string;
  pusher: string;
  wellName: string;
  otherInfo: string;
  location: string;
  task: string;
  date: string;
  ppeSelected: string;
  locations: string[];
  locationAcks: Record<string, boolean>;
  prepared: Record<string, boolean>;
  notes: string;
  signature: string;
};

export type SummaryField = {
  label: string;
  value: string;
};
