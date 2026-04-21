// Shared data contract for Location & Activity rows.
// Resolves activity ONCE at the data layer so the render layer never has to
// fall back. Prevents repeated UI regressions where activity disappears due
// to inconsistent fallback order across screens.

export type LocationActivityRow = {
  name: string;
  resolvedActivity: string;
};

export type ActivityFormLike = {
  /** Current form-level job activity (home / steps / ppe / signoff). */
  jobActivityName?: string;
  /** Legacy alias. */
  task?: string;
  /** Legacy alias used by some viewers. */
  jsaType?: string;
};

/**
 * Resolve a single row's activity string. Never returns null/undefined —
 * only a string (empty if nothing resolves).
 *
 * Order:
 *   row.jobType → form.jobActivityName → form.task → form.jsaType → ''
 */
export function resolveActivity(
  row: { jobType?: string } | undefined | null,
  form: ActivityFormLike,
): string {
  const rowJob = (row && typeof (row as any).jobType === 'string')
    ? ((row as any).jobType as string)
    : '';
  const a = rowJob.trim();
  if (a) return a;
  const b = (form.jobActivityName || '').trim();
  if (b) return b;
  const c = (form.task || '').trim();
  if (c) return c;
  const d = (form.jsaType || '').trim();
  if (d) return d;
  return '';
}

/**
 * Build the unified row array that JsaSummaryCard (and other row renderers)
 * consume. Callers pass raw `wells` (objects or strings), raw `locations`
 * (strings), and the current form. Every returned row has a string
 * `resolvedActivity`.
 *
 * Rows with an empty resolvedActivity are logged as a DATA bug — the render
 * layer no longer has a safety net.
 */
export function buildLocationActivityRows(
  wells: Array<{ name?: string; jobType?: string } | string | null | undefined>,
  locations: Array<string | null | undefined>,
  form: ActivityFormLike,
): LocationActivityRow[] {
  const rows: LocationActivityRow[] = [];
  for (const w of wells || []) {
    const name = (typeof w === 'string' ? w : (w?.name || '')).trim();
    if (!name) continue;
    const activity = resolveActivity(typeof w === 'string' ? undefined : w, form);
    if (!activity) {
      console.warn(
        '[JSA][resolvedActivity MISSING] well row has no activity:',
        JSON.stringify({ row: w, form }),
      );
    }
    rows.push({ name, resolvedActivity: activity });
  }
  for (const l of locations || []) {
    if (!l) continue;
    const name = String(l).trim();
    if (!name) continue;
    const activity = resolveActivity(undefined, form);
    if (!activity) {
      console.warn(
        '[JSA][resolvedActivity MISSING] location row has no activity:',
        JSON.stringify({ name, form }),
      );
    }
    rows.push({ name, resolvedActivity: activity });
  }
  return rows;
}
