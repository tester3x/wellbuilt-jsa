/** Read-only card projection. Sparse legacy reports remain sparse; never infer
 * shift closure or replace their signed content with a current template. */
const text = (value: unknown) => typeof value === 'string' && value.trim() !== '-' ? value.trim() : '';
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const distinct = (values: string[]) => [...new Map(values.filter(Boolean).map(value => [value.toLowerCase(), value])).values()];
const activitiesByCode: Record<string, string> = { pw: 'Production Water', sw: 'Service Work', fw: 'Fresh Water' };
const activity = (value: unknown) => activitiesByCode[text(value).toLowerCase()] || text(value);
function instant(value: unknown): Date | null {
  const date = typeof value === 'number' || typeof value === 'string' && /^\d{13}$/.test(value) ? new Date(Number(value)) : text(value) ? new Date(text(value)) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
}
export function jsaHistorySummary(record: any, locale = 'en-US') {
  const wells = array(record.wells), places = array(record.locations), jobs = array(record.coveredJobs), additions = array(record.additions);
  const locations = distinct([
    ...wells.map(row => typeof row === 'string' ? text(row) : text(row?.name)),
    ...places.map(row => typeof row === 'string' ? text(row) : text(row?.name || row?.location)),
    ...jobs.flatMap(row => [text(row?.wellName), text(row?.dropOff || row?.hauledTo)]),
    ...additions.map(row => text(row?.location || row?.name)), text(record.wellName), text(record.location),
  ]);
  const activities = distinct([
    ...wells.map(row => activity(row?.jobType || row?.activity)),
    ...places.map(row => activity(row?.jobType || row?.activity)),
    ...jobs.map(row => activity(row?.jobType || row?.activity)),
    ...additions.map(row => activity(row?.activity || row?.jobType)),
    activity(record.jobActivityName), activity(record.task), activity(record.jsaType),
  ]);
  const formDate = text(record.date || record.formDate);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(formDate) ? instant(formDate + 'T12:00:00') : instant(record.timestamp || record.createdAt);
  const signed = instant(record.timestamp || record.createdAt);
  const ended = instant(record.closedAt || record.closedAtMs || record.finalizedAtMs);
  const status = record.state === 'open' && record.workflow === 'standalone' ? 'Ongoing'
    : record.state === 'closed' || record.state === 'finalized' ? 'Ended' : 'Signed report';
  const shift = typeof record.shiftId === 'string' && /^\d{4}-\d{2}-\d{2}_\d{6}$/.test(record.shiftId) ? 'On shift'
    : record.shiftId === null ? 'Off shift' : 'Shift not recorded';
  return { locations, activities, status, shift,
    date: date ? date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '',
    signedAt: signed ? signed.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : '',
    endedAt: ended ? ended.toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '',
    note: text(record.notes || record.otherInfo),
    search: [formDate, ...locations, ...activities, text(record.driverName), text(record.truckNumber)].join(' ').toLowerCase(),
  };
}
