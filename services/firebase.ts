import { initializeApp } from "firebase/app";
import {
  getFirestore,
} from "firebase/firestore";

// Firebase configuration — WellBuilt Suite (shared with WB Tickets)
const firebaseConfig = {
  apiKey: "AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI",
  authDomain: "wellbuilt-sync.firebaseapp.com",
  databaseURL: "https://wellbuilt-sync-default-rtdb.firebaseio.com",
  projectId: "wellbuilt-sync",
  storageBucket: "wellbuilt-sync.firebasestorage.app",
  messagingSenderId: "559487114498",
  appId: "1:559487114498:web:e951ab0c6388339d5bf61b",
  measurementId: "G-XWQQ98B8LG",
};

// Initialize Firebase. Auth is attached to this same app in
// services/sso/jsaGovernedAuthLive.ts so callables and Auth share project.
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export type FirebaseJSA = {
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
  // Device identifier for filtering
  deviceId: string;
  // Sync metadata
  syncedAt: string;
};

/**
 * Upload a single JSA to Firebase
 */
export async function uploadJSA(jsa: Omit<FirebaseJSA, "syncedAt">) {
  try {
    await (await import('./legacyEvidence')).persistLegacyJsaEvidence(jsa);
    return { success: true };
  } catch (error) {
    console.error("Error uploading JSA:", error);
    return { success: false, error };
  }
}

/**
 * Upload multiple JSAs to Firebase
 */
export async function uploadAllJSAs(jsas: Omit<FirebaseJSA, "syncedAt">[]) {
  const results = await Promise.all(jsas.map(uploadJSA));
  const failed = results.filter((r) => !r.success);
  return {
    success: failed.length === 0,
    uploaded: results.filter((r) => r.success).length,
    failed: failed.length,
  };
}

/**
 * Fetch all JSAs for a specific device from Firebase
 */
export async function fetchJSAsForDevice(deviceId: string): Promise<FirebaseJSA[]> {
  try {
    // Device IDs are presentation filters, never authorization.
    const rows:FirebaseJSA[]=[];let after:string|null=null;
    for(let page=0;page<20;page++){
      const reply=await (await import('./legacyEvidence')).legacyEvidenceCall({operation:'list',after});
      const batch=reply.records as FirebaseJSA[];rows.push(...batch);
      if(batch.length<50)return rows;
      const next=batch[batch.length-1]?.id;if(!next||next===after)throw Error('JSA history cursor is invalid.');after=next;
    }
    throw Error('JSA history refresh is incomplete; local originals retained.');
  } catch (error) {
    console.error("Error fetching JSAs:", error);
    throw error;
  }
}

/**
 * Fetch all JSAs for a specific driver (useful for multi-device access)
 */
export async function fetchJSAsForDriver(driverName: string): Promise<FirebaseJSA[]> {
  try {
    // A display name is not an owner identity. Use the authenticated owner list.
    const reply=await (await import('./legacyEvidence')).legacyEvidenceCall({operation:'list'});
    return (reply.records as FirebaseJSA[]).filter(r=>r.driverName===driverName);
  } catch (error) {
    console.error("Error fetching JSAs for driver:", error);
    throw error;
  }
}

/**
 * Delete a JSA from Firebase
 */
export async function deleteJSAFromCloud(jsaId: string) {
  throw new Error('Saved JSA reports cannot be deleted by the client.');
}

/**
 * Check if Firebase is properly configured
 */
export function isFirebaseConfigured(): boolean {
  return (
    firebaseConfig.apiKey !== "YOUR_API_KEY" &&
    firebaseConfig.projectId !== "YOUR_PROJECT_ID"
  );
}

export { db, app };
