// services/jsaPdfHtml.ts
// Shared HTML builder for JSA PDF — used by completed screen (inline preview)
// and pdf screen (generate + share).

// PPE ID → human-readable label lookup
const PPE_LABELS: Record<string, string> = {
  safetyGlasses: 'Safety Glasses',
  safetyShoes: 'Safety Shoes',
  frClothing: 'FR Clothing',
  hearingProtection: 'Hearing Protection',
  hardHat: 'Hard Hat',
  respirator: 'Respirator',
  chemicalGloves: 'Chemical/Impact Gloves',
  fourGasMonitor: 'Four Gas Monitor',
  fallProtection: 'Fall Protection',
};

export interface LocationStamp {
  name: string;
  type: 'pickup' | 'dropoff';
  jobType: string;
  stampedAt: string;
  dispatchId: string;
}

interface BuildOptions {
  driverName: string;
  truckNumber: string;
  pusher: string;
  wellName: string;
  jobActivity: string;
  date: string;
  notes: string;
  signature: string;
  signatureImage?: string;
  locations: string[];
  locationAcks: Record<string, string>;
  locationStamps?: LocationStamp[];
  ppeItems: string[];
  preparedItems: string[];
  emergencyContacts: { label: string; phone: string }[];
  companyContacts: { label: string; phone: string }[];
  accent: string;
  logoDataUrl?: string | null;
}

export function buildJsaPdfHtml(opts: BuildOptions): string {
  const {
    driverName, truckNumber, pusher, wellName, jobActivity, date,
    notes, signature, signatureImage, locations, locationAcks,
    ppeItems, preparedItems, emergencyContacts, companyContacts,
    accent, logoDataUrl,
  } = opts;

  const jobLocationsValue = locations.length ? locations.join(', ') : '-';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Job Safety Analysis</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
      background: #f5f5f5; color: #111;
    }
    .page { padding: 24px 20px 32px; }
    .header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
    .logo { flex-shrink: 0; }
    .logo img { width: 80px; height: 80px; object-fit: contain; }
    .title-block { flex: 1; }
    .title { margin: 0; font-size: 22px; font-weight: 700; }
    .subtitle { margin: 4px 0 0; font-size: 12px; color: #666; }
    .tag-row { margin-top: 6px; font-size: 11px; display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { padding: 2px 8px; border-radius: 999px; background: ${accent}; color: #111; font-weight: 500; }
    .section { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; border: 1px solid #e0e0e0; }
    .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin: 0 0 4px; font-weight: 600; }
    .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
    .row-label { color: #666; }
    .row-value { font-weight: 500; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; font-size: 11px; }
    .pill { padding: 3px 8px; border-radius: 999px; border: 1px solid ${accent}; color: #111; background: #fff7d6; }
    .checklist-item { font-size: 12px; padding: 2px 0; }
    .notes { font-size: 12px; line-height: 1.4; white-space: pre-wrap; }
    .signature-row { display: flex; justify-content: space-between; font-size: 12px; margin-top: 8px; }
    .signature-label { color: #666; }
    .signature-value { font-weight: 600; border-bottom: 1px solid #ccc; padding-bottom: 2px; min-width: 160px; text-align: right; }
    .signature-img { max-width: 200px; max-height: 60px; }
    .badge-strip { display: flex; gap: 8px; margin-top: 4px; font-size: 11px; }
    .badge { padding: 2px 8px; border-radius: 999px; border: 1px solid #e0e0e0; background: #fff; }
    .badge-okay { border-color: #e0e0e0; color: #111; background: #fff; font-weight: 500; }
    .contact-row { font-size: 11px; padding: 2px 0; display: flex; justify-content: space-between; gap: 8px; }
    .contact-label { max-width: 70%; }
    .contact-phone { font-weight: 600; text-align: right; min-width: 30%; }
    .locations-list { font-size: 12px; line-height: 1.4; }
    .locations-list div { margin-bottom: 2px; }
    .ack { color: #666; font-size: 10px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${logoDataUrl ? `<div class="logo"><img src="${logoDataUrl}" alt="Logo" /></div>` : ''}
      <div class="title-block">
        <h1 class="title">Job Safety Analysis</h1>
        <div class="tag-row">
          <span class="tag">JSA</span>
          <span class="tag">Field Operations</span>
        </div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Job Details</h2>
      <div class="row"><span class="row-label">Driver</span><span class="row-value">${driverName || '-'}</span></div>
      <div class="row"><span class="row-label">Truck #</span><span class="row-value">${truckNumber || '-'}</span></div>
      <div class="row"><span class="row-label">Pusher</span><span class="row-value">${pusher || '-'}</span></div>
      <div class="row"><span class="row-label">Well</span><span class="row-value">${wellName || '-'}</span></div>
      <div class="row"><span class="row-label">Location</span><span class="row-value">${jobLocationsValue}</span></div>
      <div class="row"><span class="row-label">Job/Activity</span><span class="row-value">${jobActivity || '-'}</span></div>
      <div class="row"><span class="row-label">Date</span><span class="row-value">${date || '-'}</span></div>
      <div class="badge-strip">
        <div class="badge badge-okay">JSA Reviewed</div>
        <div class="badge">Generated: ${new Date().toLocaleString()}</div>
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">PPE Selected</h2>
      <div class="pill-row">
        ${ppeItems.length > 0
          ? ppeItems.map(item => `<span class="pill">${PPE_LABELS[item] || item}</span>`).join('')
          : '<span style="font-size:11px;color:#999">No PPE recorded</span>'}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Prepared for Work</h2>
      <div class="checklist-item">${preparedItems.includes('trained') ? '☑' : '☐'} I am properly trained for the job</div>
      <div class="checklist-item">${preparedItems.includes('toolsAndPpe') ? '☑' : '☐'} I have the tools and PPE needed for work</div>
      <div class="checklist-item">${preparedItems.includes('sds') ? '☑' : '☐'} SDS</div>
    </div>

    <div class="section">
      <h2 class="section-title">Locations Inspected</h2>
      ${(opts.locationStamps && opts.locationStamps.length > 0)
        ? `<table style="width:100%;border-collapse:collapse;font-size:11px">
            <tr style="border-bottom:1px solid #e0e0e0;color:#666">
              <th style="text-align:left;padding:4px 0;font-weight:600">Time</th>
              <th style="text-align:left;padding:4px 0;font-weight:600">Location</th>
              <th style="text-align:center;padding:4px 0;font-weight:600">Type</th>
            </tr>
            ${opts.locationStamps
              .sort((a, b) => a.stampedAt.localeCompare(b.stampedAt))
              .map(s => {
                const time = new Date(s.stampedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                const badge = s.type === 'pickup'
                  ? '<span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:999px;font-size:10px">PICKUP</span>'
                  : '<span style="background:#dbeafe;color:#1e40af;padding:1px 6px;border-radius:999px;font-size:10px">DROP-OFF</span>';
                return `<tr style="border-bottom:1px solid #f0f0f0">
                  <td style="padding:3px 0">${time}</td>
                  <td style="padding:3px 0;font-weight:500">${s.name}</td>
                  <td style="padding:3px 0;text-align:center">${badge}</td>
                </tr>`;
              }).join('')}
          </table>`
        : (locations.length > 0
          ? `<div class="locations-list">${locations.map(loc =>
              `<div>${loc}${locationAcks[loc] ? `<div class="ack">Ack: ${new Date(locationAcks[loc]).toLocaleString()}</div>` : ''}</div>`
            ).join('')}</div>`
          : '<div style="color:#999;font-size:12px">No locations recorded.</div>')}
    </div>

    <div class="section">
      <h2 class="section-title">Notes & Signature</h2>
      <div>
        <div style="font-size:11px;color:#666;margin-bottom:4px">Additional Notes</div>
        <div class="notes">${notes?.trim() || 'No additional notes provided.'}</div>
      </div>
      <div class="signature-row">
        <span class="signature-label">Signature</span>
        ${signatureImage
          ? `<img src="data:image/png;base64,${signatureImage}" class="signature-img" />`
          : `<span class="signature-value">${signature || ''}</span>`}
      </div>
      ${signature ? `<div style="font-size:11px;color:#666;text-align:right;margin-top:2px">${signature}</div>` : ''}
    </div>

    ${emergencyContacts.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Emergency Contacts</h2>
      ${emergencyContacts.map(c => `
        <div class="contact-row">
          <span class="contact-label">${c.label}</span>
          <span class="contact-phone">${c.phone}</span>
        </div>
      `).join('')}
    </div>` : ''}

    ${companyContacts.length > 0 ? `
    <div class="section">
      <h2 class="section-title">Company Contacts</h2>
      ${companyContacts.map(c => `
        <div class="contact-row">
          <span class="contact-label">${c.label}</span>
          <span class="contact-phone">${c.phone}</span>
        </div>
      `).join('')}
    </div>` : ''}
  </div>
</body>
</html>`;
}
