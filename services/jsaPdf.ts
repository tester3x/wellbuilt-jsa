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
 * Optional linkage metadata for downstream consumers (Dashboard queries,
 * WB T per_load PDF attach). Without driverHash, the `jsa_completions` doc
 * can't be joined back to a specific driver.
 */
export interface JsaPdfMeta {
  driverHash?: string;
  jsaDocId?: string;
  jsaDate?: string;  // local YYYY-MM-DD — use instead of UTC today() for doc ids
}

/**
 * Generate a compact JSA PDF and upload to Firebase Storage.
 * Returns the public download URL, or null on any failure (logged).
 */
export async function generateAndUploadJsaPdf(
  data: JsaPdfData,
  companyId: string,
  meta: JsaPdfMeta = {},
): Promise<string | null> {
  const stage = { step: 'init' };
  try {
    // Use the shared PDF HTML builder for consistent output
    const wellEntries = data.wells.map(w => {
      if (typeof w === 'string') return { name: w, jobType: data.jobActivity };
      return w;
    });

    stage.step = 'buildHtml';
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

    stage.step = 'printToFile';
    const { uri } = await Print.printToFileAsync({ html });

    stage.step = 'readBase64';
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

    // Upload to Firebase Storage via REST. Use the local jsaDate (meta) when
    // provided so the Storage path and the jsa_completions doc id agree with
    // the day the driver perceives they're on — not UTC, which rolls at
    // 6 PM Mountain.
    stage.step = 'upload';
    const date = meta.jsaDate || data.date || new Date().toISOString().slice(0, 10);
    const safeName = data.driverName.replace(/[^a-zA-Z0-9]/g, '_');
    const storagePath = `jsa/${companyId}/${date}/${safeName}_${Date.now()}.pdf`;
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?uploadType=media&key=${FIREBASE_API_KEY}`;

    const resp = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body: Uint8Array.from(atob(base64), c => c.charCodeAt(0)),
    });

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      console.warn(`[jsaPdf] Upload failed: HTTP ${resp.status} path=${storagePath} body=${body.slice(0, 300)}`);
      return null;
    }

    stage.step = 'parseUploadResult';
    const result = await resp.json();
    const token = result.downloadTokens;
    if (!token) {
      // Some Firebase Storage responses omit downloadTokens unless the
      // upload sets firebaseStorageDownloadTokens metadata. Falling back
      // to an untokenized alt=media URL will 403 for public reads. Surface
      // the issue loudly instead of returning a broken URL.
      console.warn('[jsaPdf] Upload succeeded but response is missing downloadTokens:', JSON.stringify(result).slice(0, 300));
      return null;
    }
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    // Clean up temp file
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});

    console.log('[jsaPdf] PDF uploaded:', downloadUrl);

    // Write URL to Firestore so Dashboard + WB T can find it. Now includes
    // driverHash + jsaDocId so a specific driver's JSA can be located.
    stage.step = 'writeCompletions';
    try {
      const docPath = `jsa_completions/${companyId}_${date}`;
      const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${docPath}?key=${FIREBASE_API_KEY}`;
      const fields: any = {
        pdfUrl: { stringValue: downloadUrl },
        driverName: { stringValue: data.driverName },
        companyId: { stringValue: companyId },
        date: { stringValue: date },
        updatedAt: { timestampValue: new Date().toISOString() },
      };
      if (meta.driverHash) {
        fields.driverHash = { stringValue: meta.driverHash };
        fields.driverId = { stringValue: meta.driverHash };
      }
      if (meta.jsaDocId) fields.jsaDocId = { stringValue: meta.jsaDocId };
      const compResp = await fetch(firestoreUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });
      if (!compResp.ok) {
        const body = await compResp.text().catch(() => '');
        console.warn(`[jsaPdf] jsa_completions write failed: HTTP ${compResp.status} ${body.slice(0, 200)}`);
      }
    } catch (err) {
      console.warn('[jsaPdf] jsa_completions write error (non-fatal):', err);
    }

    return downloadUrl;
  } catch (err: any) {
    console.warn(`[jsaPdf] Generate/upload failed at stage=${stage.step}:`, err?.message || err);
    return null;
  }
}
