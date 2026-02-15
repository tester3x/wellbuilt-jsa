import { initializeApp } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  where,
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Collection name for JSAs
const JSA_COLLECTION = "jsas";

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
    const docRef = doc(db, JSA_COLLECTION, jsa.id);
    await setDoc(docRef, {
      ...jsa,
      syncedAt: new Date().toISOString(),
    });
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
    const q = query(
      collection(db, JSA_COLLECTION),
      where("deviceId", "==", deviceId)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as FirebaseJSA);
  } catch (error) {
    console.error("Error fetching JSAs:", error);
    return [];
  }
}

/**
 * Fetch all JSAs for a specific driver (useful for multi-device access)
 */
export async function fetchJSAsForDriver(driverName: string): Promise<FirebaseJSA[]> {
  try {
    const q = query(
      collection(db, JSA_COLLECTION),
      where("driverName", "==", driverName)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data() as FirebaseJSA);
  } catch (error) {
    console.error("Error fetching JSAs for driver:", error);
    return [];
  }
}

/**
 * Delete a JSA from Firebase
 */
export async function deleteJSAFromCloud(jsaId: string) {
  try {
    await deleteDoc(doc(db, JSA_COLLECTION, jsaId));
    return { success: true };
  } catch (error) {
    console.error("Error deleting JSA from cloud:", error);
    return { success: false, error };
  }
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

export { db };
