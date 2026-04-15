// services/jsaPdfHtml.ts
// Shared HTML builder for JSA PDF — used by completed screen (inline preview)
// and pdf generation (generate + share).

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

// Prepared item ID → human-readable label lookup
const PREPARED_LABELS: Record<string, string> = {
  trained: 'I am properly trained for the job',
  toolsAndPpe: 'I have the tools and PPE needed for work',
  sds: 'SDS',
  weatherChecked: 'Weather conditions checked',
  emergencyPlan: 'Emergency action plan reviewed',
};

export interface LocationStamp {
  name: string;
  type: 'pickup' | 'dropoff';
  jobType: string;
  stampedAt: string;
  dispatchId: string;
}

export interface WellEntryPdf {
  name: string;
  operator?: string;
  county?: string;
  jobType?: string;
}

interface BuildOptions {
  driverName: string;
  truckNumber: string;
  pusher: string;
  wellName: string;        // legacy single well (fallback)
  wells?: WellEntryPdf[];  // new: full well objects with job types
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
    driverName, truckNumber, pusher, wellName, wells, jobActivity, date,
    notes, signature, signatureImage, locations, locationAcks,
    ppeItems, preparedItems, emergencyContacts, companyContacts,
    accent, logoDataUrl,
  } = opts;

  // Build wells display — prefer wells array, fall back to wellName
  let wellsHtml = '';
  if (wells && wells.length > 0) {
    wellsHtml = wells.map(w => {
      const name = typeof w === 'string' ? w : (w?.name || '');
      const jt = typeof w !== 'string' && w?.jobType ? w.jobType : '';
      return `<div class="row">
        <span class="row-label">${name}</span>
        <span class="row-value">${jt || jobActivity || '-'}</span>
      </div>`;
    }).join('');
  } else if (wellName && wellName !== '-') {
    wellsHtml = `<div class="row"><span class="row-label">${wellName}</span><span class="row-value">${jobActivity || '-'}</span></div>`;
  }

  // Build signature HTML — black on white, full width
  const sigImgSrc = signatureImage
    ? (signatureImage.startsWith('data:') ? signatureImage : `data:image/png;base64,${signatureImage}`)
    : null;

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
    .signature-block {
      margin-top: 8px;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 8px;
    }
    .signature-img {
      width: 100%;
      max-height: 80px;
      object-fit: contain;
      display: block;
    }
    .signature-name {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
      text-align: right;
    }
    .badge-strip { display: flex; gap: 8px; margin-top: 4px; font-size: 11px; }
    .badge { padding: 2px 8px; border-radius: 999px; border: 1px solid #e0e0e0; background: #fff; }
    .badge-okay { border-color: #e0e0e0; color: #111; background: #fff; font-weight: 500; }
    .contact-row { font-size: 11px; padding: 2px 0; display: flex; justify-content: space-between; gap: 8px; }
    .contact-label { max-width: 70%; }
    .contact-phone { font-weight: 600; text-align: right; min-width: 30%; }
    .locations-list { font-size: 12px; line-height: 1.4; }
    .locations-list div { margin-bottom: 2px; }
    .ack { color: #666; font-size: 10px; }
    .wells-table { width: 100%; font-size: 12px; }
    .wells-table .well-header { display: flex; justify-content: space-between; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; border-bottom: 1px solid #e0e0e0; padding-bottom: 4px; margin-bottom: 4px; }
    .footer { text-align: center; font-size: 10px; color: #999; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e0e0e0; }
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
      ${pusher ? `<div class="row"><span class="row-label">Pusher</span><span class="row-value">${pusher}</span></div>` : ''}
      <div class="row"><span class="row-label">Date</span><span class="row-value">${date || '-'}</span></div>
      <div class="badge-strip">
        <div class="badge badge-okay">JSA Reviewed</div>
        <div class="badge">Generated: ${new Date().toLocaleString()}</div>
      </div>
    </div>

    ${wellsHtml ? `
    <div class="section">
      <h2 class="section-title">Wells / Job Sites</h2>
      <div class="wells-table">
        <div class="well-header"><span>Well / Location</span><span>Job Type</span></div>
        ${wellsHtml}
      </div>
    </div>` : ''}

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
      <h2 class="section-title">PPE Selected</h2>
      <div class="pill-row">
        ${ppeItems.length > 0
          ? ppeItems.map(item => `<span class="pill">${PPE_LABELS[item] || item}</span>`).join('')
          : '<span style="font-size:11px;color:#999">No PPE recorded</span>'}
      </div>
    </div>

    <div class="section">
      <h2 class="section-title">Prepared for Work</h2>
      ${preparedItems.map(item =>
        `<div class="checklist-item">☑ ${PREPARED_LABELS[item] || item}</div>`
      ).join('')}
      ${preparedItems.length === 0 ? '<div style="color:#999;font-size:12px">No checklist responses recorded.</div>' : ''}
    </div>

    <div class="section">
      <h2 class="section-title">Notes & Signature</h2>
      <div>
        <div style="font-size:11px;color:#666;margin-bottom:4px">Additional Notes</div>
        <div class="notes">${notes?.trim() || 'No additional notes provided.'}</div>
      </div>
      ${sigImgSrc
        ? `<div class="signature-block">
            <img src="${sigImgSrc}" class="signature-img" alt="Signature" />
          </div>
          <div class="signature-name">${signature || ''}</div>`
        : `<div style="margin-top:8px;font-size:12px">
            <span style="color:#666">Signature:</span>
            <span style="font-weight:600;border-bottom:1px solid #ccc;padding-bottom:2px;margin-left:8px">${signature || ''}</span>
          </div>`}
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

    <div class="footer">
      Generated by WellBuilt JSA
    </div>
  </div>
</body>
</html>`;
}
