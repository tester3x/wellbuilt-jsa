// jsaPdf.ts — Auto-generate JSA PDF and upload to Firebase Storage.
// Called on JSA submit to produce a paper-style PDF for per_load ticket attachment.

import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system';

const FIREBASE_PROJECT = 'wellbuilt-sync';
const FIREBASE_API_KEY = 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI';
const STORAGE_BUCKET = 'wellbuilt-sync.firebasestorage.app';

interface JsaPdfData {
  driverName: string;
  truckNumber: string;
  date: string;
  wells: string[];
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
    const html = buildJsaHtml(data);
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
      const driverHash = data.driverName.toLowerCase().replace(/[^a-z0-9]/g, '');
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

function buildJsaHtml(data: JsaPdfData): string {
  const accent = data.accentColor || '#DAA520';
  const wells = data.wells.length > 0 ? data.wells.join(', ') : '—';
  const locations = data.locations.length > 0 ? data.locations.join(', ') : '—';
  const ppe = data.ppeItems.length > 0
    ? data.ppeItems.map(p => `<span style="display:inline-block;background:#f0f0f0;border-radius:12px;padding:2px 10px;margin:2px;font-size:11px">${p}</span>`).join('')
    : '<span style="color:#999">None selected</span>';
  const prepared = data.preparedItems.length > 0
    ? data.preparedItems.map(p => `<div style="font-size:12px;margin:2px 0">&#9745; ${p}</div>`).join('')
    : '';
  const sigImg = data.signatureImage
    ? `<img src="data:image/png;base64,${data.signatureImage}" style="max-width:200px;max-height:60px;margin-top:4px" />`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{font-family:Helvetica,Arial,sans-serif;margin:20px;color:#111;font-size:13px;background:#fff}
  h1{font-size:18px;margin:0 0 4px;color:${accent}}
  h2{font-size:13px;color:${accent};margin:14px 0 4px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #ddd;padding-bottom:2px}
  .row{display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #f0f0f0}
  .label{color:#666;font-size:12px}.value{font-weight:600;font-size:12px;text-align:right}
  .sig-box{border:1px solid #ddd;border-radius:6px;padding:8px;margin-top:4px;background:#fafafa}
  .footer{text-align:center;color:#999;font-size:10px;margin-top:16px;border-top:1px solid #ddd;padding-top:6px}
</style></head><body>
<h1>JOB SAFETY ANALYSIS</h1>
<div style="font-size:11px;color:#666">${data.companyName || 'WellBuilt'} — ${data.date}</div>

<h2>Job Details</h2>
<div class="row"><span class="label">Driver</span><span class="value">${data.driverName}</span></div>
<div class="row"><span class="label">Truck #</span><span class="value">${data.truckNumber}</span></div>
<div class="row"><span class="label">Job/Activity</span><span class="value">${data.jobActivity}</span></div>
${data.pusher ? `<div class="row"><span class="label">Pusher</span><span class="value">${data.pusher}</span></div>` : ''}
<div class="row"><span class="label">Well(s)</span><span class="value">${wells}</span></div>
<div class="row"><span class="label">Location(s)</span><span class="value">${locations}</span></div>

<h2>PPE</h2>
<div>${ppe}</div>

${prepared ? `<h2>Prepared for Work</h2><div>${prepared}</div>` : ''}

${data.notes ? `<h2>Notes</h2><div style="font-size:12px">${data.notes}</div>` : ''}

<h2>Signature</h2>
<div class="sig-box">
  ${sigImg}
  <div style="font-size:12px;margin-top:4px;font-weight:600">${data.signature}</div>
  <div style="font-size:10px;color:#999">${data.date}</div>
</div>

<div class="footer">Generated by WellBuilt JSA</div>
</body></html>`;
}
