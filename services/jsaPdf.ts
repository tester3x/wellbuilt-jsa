// jsaPdf.ts — Auto-generate JSA PDF and upload to Firebase Storage.
// Called on JSA submit to produce a paper-style PDF for per_load ticket attachment.

import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';
import { buildJsaPdfHtml } from './jsaPdfHtml';

const FIREBASE_PROJECT = 'wellbuilt-sync';
const FIREBASE_API_KEY = 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI';
const STORAGE_BUCKET = 'wellbuilt-sync.firebasestorage.app';

interface JsaPdfData {
  driverName: string;
  truckNumber: string;
  date: string;
  wells: any[];           // string[] or WellEntry[]
  locations: string[];
  jobActivity: string;
  pusher: string;
  ppeItems: string[];
  preparedItems: string[];
  notes: string;
  signature: string;       // typed name
  signatureImage?: string; // base64 PNG
  companyName?: string;
  accentColor?: string;
}

/**
 * Generate a compact JSA PDF and upload to Firebase Storage.
 * Returns the public download URL.
 */
export async function generateAndUploadJsaPdf(data: JsaPdfData, companyId: string): Promise<string | null> {
  try {
    // Use the shared PDF HTML builder for consistent output
    const wellEntries = data.wells.map(w => {
      if (typeof w === 'string') return { name: w, jobType: data.jobActivity };
      return w;
    });

    const html = buildJsaPdfHtml({
      driverName: data.driverName,
      truckNumber: data.truckNumber,
      pusher: data.pusher,
      wellName: wellEntries.length > 0 ? wellEntries.map(w => w.name || w).join(', ') : '',
      wells: wellEntries.length > 0 ? wellEntries : undefined,
      jobActivity: data.jobActivity,
      date: data.date,
      notes: data.notes,
      signature: data.signature,
      signatureImage: data.signatureImage,
      locations: data.locations,
      locationAcks: {},
      ppeItems: data.ppeItems,
      preparedItems: data.preparedItems,
      emergencyContacts: [],
      companyContacts: [],
      accent: data.accentColor || '#DAA520',
      logoDataUrl: null,
    });

    const { uri } = await Print.printToFileAsync({ html });

    // Read the PDF file as base64
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

    // Upload to Firebase Storage via REST
    const date = data.date || new Date().toISOString().slice(0, 10);
    const safeName = data.driverName.replace(/[^a-zA-Z0-9]/g, '_');
    const storagePath = `jsa/${companyId}/${date}/${safeName}_${Date.now()}.pdf`;
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?uploadType=media&key=${FIREBASE_API_KEY}`;

    const resp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
    });

    if (!resp.ok) {
      console.warn('[jsaPdf] Upload failed:', resp.status);
      return null;
    }

    const result = await resp.json();
    const token = result.downloadTokens;
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    // Clean up temp file
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

    console.log('[jsaPdf] PDF uploaded:', downloadUrl);

    // Write URL to Firestore so WB T can read it for per_load auto-attach
    try {
      const today = new Date().toISOString().slice(0, 10);
      const docPath = `jsa_completions/${companyId}_${today}`;
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${docPath}?key=${FIREBASE_API_KEY}`;
      await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            pdfUrl: { stringValue: downloadUrl },
            driverName: { stringValue: data.driverName },
            date: { stringValue: data.date },
            updatedAt: { stringValue: new Date().toISOString() },
          },
        }),
      });
    } catch {}

    return downloadUrl;
  } catch (err) {
    console.warn('[jsaPdf] Generate/upload failed:', err);
    return null;
  }
}
