import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";

import { STORAGE_KEYS } from "../constants/storageKeys";
import {
  deleteJSAFromCloud,
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
    const deviceId = await getDeviceId();

    // Get local JSAs
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.saves);
    const localJSAs: FirebaseJSA[] = localData ? JSON.parse(localData) : [];

    // Add deviceId to each JSA
    const jsasWithDevice = localJSAs.map((jsa) => ({
      ...jsa,
      deviceId,
    }));

    // Upload to cloud
    const uploadResult = await uploadAllJSAs(jsasWithDevice);

    // Fetch from cloud (in case there's data from other sessions)
    const cloudJSAs = await fetchJSAsForDevice(deviceId);

    // Merge: prefer cloud data for conflicts (by ID), but keep local-only items
    const localIds = new Set(localJSAs.map((j) => j.id));
    const cloudIds = new Set(cloudJSAs.map((j) => j.id));

    // Items only in cloud (downloaded)
    const downloadedItems = cloudJSAs.filter((j) => !localIds.has(j.id));

    // Merge all items
    const mergedJSAs = [
      ...localJSAs,
      ...downloadedItems,
    ];

    // Save merged data locally
    await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(mergedJSAs));

    // Update sync time
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
  try {
    // Delete from cloud
    if (isFirebaseConfigured()) {
      await deleteJSAFromCloud(jsaId);
    }

    // Delete from local
    const localData = await AsyncStorage.getItem(STORAGE_KEYS.saves);
    const localJSAs = localData ? JSON.parse(localData) : [];
    const filtered = localJSAs.filter((j: { id: string }) => j.id !== jsaId);
    await AsyncStorage.setItem(STORAGE_KEYS.saves, JSON.stringify(filtered));

    return true;
  } catch (error) {
    console.error("Error deleting JSA everywhere:", error);
    return false;
  }
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
