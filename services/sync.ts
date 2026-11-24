import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";

import { STORAGE_KEYS } from "../constants/storageKeys";
import {
  fetchJSAsForDevice,
  FirebaseJSA,
  isFirebaseConfigured,
  uploadAllJSAs,
} from "./firebase";

// Storage key for device ID
const DEVICE_ID_KEY = "@jsa/deviceId";
const LAST_SYNC_KEY = "@jsa/lastSync";

/**
 * Get or create a unique device identifier
 */
export async function getDeviceId(): Promise<string> {
  let deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    // Generate a unique ID for this device
    const appId = Application.applicationId || "jsa-app";
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    deviceId = `${Platform.OS}-${appId}-${timestamp}-${random}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  return deviceId;
}

/**
 * Get the last sync timestamp
 */
export async function getLastSyncTime(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_SYNC_KEY);
}

/**
 * Update the last sync timestamp
 */
async function updateLastSyncTime() {
  await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
}

/**
 * Sync local JSAs to Firebase
 * Uploads all local JSAs and merges with cloud data
 */
export async function syncToCloud(): Promise<{
  success: boolean;
  uploaded: number;
  downloaded: number;
  error?: string;
}> {
  if (!isFirebaseConfigured()) {
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      error: "Firebase not configured. Please add your Firebase credentials.",
    };
  }

  try {
    const {loadUsableGovernedSession}=await import('./sso/jsaGovernedAuthLive');
    const owner=await loadUsableGovernedSession();
    if(!owner)throw Error('Sign in to sync saved JSA evidence.');
    const sameOwner=async()=>{const now=await loadUsableGovernedSession();if(!now||now.uid!==owner.uid||now.generation!==owner.generation||now.driverId!==owner.driverId||now.companyId!==owner.companyId)throw Error('JSA owner changed. Original evidence retained.');};
    const deviceId = await getDeviceId();

    // Get local JSAs
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.saves);
    const localJSAs: FirebaseJSA[] = localData ? JSON.parse(localData) : [];

    // Never augment a signed snapshot during replay or send a governed record
    // through the historical archive path. Unknown/foreign originals stay local.
    const jsasWithDevice = localJSAs.filter((jsa: any) => jsa.workflow !== 'standalone' && jsa.workflow !== 'prepared' && !jsa.governedRequestRef);

    const { syncStandaloneHistory } = await import('./standaloneJsa');
    await syncStandaloneHistory();

    // Upload to cloud
    const uploadResult = await uploadAllJSAs(jsasWithDevice);
    await sameOwner();

    // Fetch from cloud (in case there's data from other sessions)
    const cloudJSAs = await fetchJSAsForDevice(deviceId);
    await sameOwner();

    // Network work can overlap new signed saves. Merge into the latest local
    // state, never the snapshot captured before the upload.
    const latestData = await AsyncStorage.getItem(STORAGE_KEYS.saves);
    const latestJSAs: FirebaseJSA[] = latestData ? JSON.parse(latestData) : [];
    if (!Array.isArray(latestJSAs)) throw new Error('Local JSA storage is unreadable.');
    const evidenceKey=(j:any)=>JSON.stringify([j.companyId||null,j.driverId||j.driverHash||null,j.id]);
    const localIds = new Set(latestJSAs.map(evidenceKey));

    // Items only in cloud (downloaded)
    const downloadedItems = cloudJSAs.filter((j) => !localIds.has(evidenceKey(j)));

    // Merge all items
    const mergedJSAs = [
      ...latestJSAs,
      ...downloadedItems,
    ];

    // Save merged data locally
    await sameOwner();
    await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(mergedJSAs));

    // A partial batch is not an acknowledgement for every saved JSA.
    if (uploadResult.success !== true || JSON.stringify(latestJSAs) !== JSON.stringify(localJSAs)) return {
      success: false, uploaded: uploadResult.uploaded, downloaded: downloadedItems.length,
      error: 'Some JSAs are still saved on this phone and waiting to sync.',
    };
    await updateLastSyncTime();

    return {
      success: true,
      uploaded: uploadResult.uploaded,
      downloaded: downloadedItems.length,
    };
  } catch (error) {
    console.error("Sync error:", error);
    return {
      success: false,
      uploaded: 0,
      downloaded: 0,
      error: error instanceof Error ? error.message : "Unknown sync error",
    };
  }
}

/**
 * Delete a JSA from both local storage and cloud
 */
export async function deleteJSAEverywhere(jsaId: string): Promise<boolean> {
  // Saved reports are safety evidence, including legacy reports without a
  // trustworthy owner/schema marker. Never infer that they are disposable.
  // Standalone Close changes lifecycle metadata through its governed callable;
  // it does not delete the signed report. Retain this guard for stale callers.
  throw new Error('Saved JSA reports are retained as safety evidence. Close an open JSA instead.');
}

/**
 * Check sync status
 */
export async function getSyncStatus(): Promise<{
  configured: boolean;
  lastSync: string | null;
  deviceId: string;
}> {
  return {
    configured: isFirebaseConfigured(),
    lastSync: await getLastSyncTime(),
    deviceId: await getDeviceId(),
  };
}
