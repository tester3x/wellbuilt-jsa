// jsaStatus.ts — Query + mutate jsa_day_status docs for compliance workflows.
// Used by UnfinishedJsasModal: find prior-day JSAs with wells stamped but
// never signed off, so the driver is nagged to either finish or discard-with-reason.

const FIRESTORE_BASE =
  'https://firestore.googleapis.com/v1/projects/wellbuilt-sync/databases/(default)/documents';
const API_KEY = 'AIzaSyAGWXa-doFGzo7T5SxHVD_v5-SHXIc8wAI';

export interface UnfinishedJsa {
  id: string; // Firestore doc id (driverHash_scope) — used by the
              // active-screen filter to dedupe + report which records
              // were filtered out for which reason.
  date: string; // YYYY-MM-DD (local-date field on the doc)
  shiftId: string; // shiftId field on the doc; empty string when the
                   // doc is a legacy date-keyed record with no shiftId
                   // (those exist before the per-shift rollout). The
                   // consumer's strict scope filter rejects empty
                   // shiftId during an active shift.
  wellCount: number;
  wellNames: string[];
  discarded?: boolean; // already filtered server-side via the result
                       // post-filter, exposed for diagnostic logging.
}

/**
 * Query unfinished JSAs for this driver: wells stamped but jsaCompleted !== true,
 * not discarded, within the last `days` days, excluding today.
 */
export async function getUnfinishedJsas(
  driverHash: string,
  days = 30,
): Promise<UnfinishedJsa[]> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const cutoff = new Date(today.getTime() - days * 86400000)
    .toISOString()
    .slice(0, 10);

  const query = {
    structuredQuery: {
      from: [{ collectionId: 'jsa_day_status' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            {
              fieldFilter: {
                field: { fieldPath: 'driverHash' },
                op: 'EQUAL',
                value: { stringValue: driverHash },
              },
            },
            {
              fieldFilter: {
                field: { fieldPath: 'jsaCompleted' },
                op: 'EQUAL',
                value: { booleanValue: false },
              },
            },
          ],
        },
      },
      limit: 50,
    },
  };

  try {
    const resp = await fetch(
      `${FIRESTORE_BASE}:runQuery?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      },
    );
    if (!resp.ok) {
      console.warn('[jsaStatus] getUnfinishedJsas query failed:', resp.status);
      return [];
    }
    const results: any[] = await resp.json();
    const docs = results.filter((r: any) => r.document);
    return docs
      .map((d: any) => {
        const fields = d.document?.fields || {};
        // Doc resource name shape: projects/.../documents/jsa_day_status/{docId}
        const docName: string = d.document?.name || '';
        const id = docName.split('/').pop() || '';
        const date = fields.date?.stringValue || '';
        const shiftId = fields.shiftId?.stringValue || '';
        const wellsArr = fields.wells?.arrayValue?.values || [];
        const discarded = fields.discarded?.booleanValue === true;
        return {
          id,
          date,
          shiftId,
          wellCount: wellsArr.length,
          wellNames: wellsArr
            .map((v: any) => v?.mapValue?.fields?.name?.stringValue)
            .filter(Boolean),
          discarded,
        };
      })
      .filter(
        (j: any) =>
          j.wellCount > 0 &&
          !j.discarded &&
          j.date &&
          j.date < todayStr &&
          j.date >= cutoff,
      )
      .sort((a: any, b: any) => a.date.localeCompare(b.date)); // oldest first
  } catch (err) {
    console.warn('[jsaStatus] getUnfinishedJsas error:', err);
    return [];
  }
}

/**
 * Mark a day's JSA as discarded with a required audit reason. Writes
 * { discarded: true, discardedReason, discardedAt } to jsa_day_status.
 */
export async function discardJsa(
  driverHash: string,
  date: string,
  reason: string,
): Promise<boolean> {
  try {
    const docId = `${driverHash}_${date}`;
    const patchUrl =
      `${FIRESTORE_BASE}/jsa_day_status/${docId}?key=${API_KEY}` +
      '&updateMask.fieldPaths=discarded' +
      '&updateMask.fieldPaths=discardedReason' +
      '&updateMask.fieldPaths=discardedAt' +
      '&updateMask.fieldPaths=updatedAt';
    const resp = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          discarded: { booleanValue: true },
          discardedReason: { stringValue: reason },
          discardedAt: { timestampValue: new Date().toISOString() },
          updatedAt: { timestampValue: new Date().toISOString() },
        },
      }),
    });
    if (!resp.ok) {
      console.warn('[jsaStatus] discardJsa failed:', resp.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[jsaStatus] discardJsa error:', err);
    return false;
  }
}
