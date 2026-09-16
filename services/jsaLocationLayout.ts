export type LocationsCoveredPlacement = 'after-job-details' | 'after-assessment' | 'after-signature';
export type LocationDifferencesPlacement = 'after-assessment' | 'after-signature';

export interface JsaLocationLayout {
  schemaVersion: 1;
  locationsCoveredPlacement: LocationsCoveredPlacement;
  locationDifferencesPlacement: LocationDifferencesPlacement;
}

export const TEMPLATE_LOCATION_LAYOUT: JsaLocationLayout = {
  schemaVersion: 1,
  locationsCoveredPlacement: 'after-job-details',
  locationDifferencesPlacement: 'after-assessment',
};

/** Missing/legacy layout metadata gets a universal addendum after the signed JSA. */
export const LEGACY_LOCATION_ADDENDUM_LAYOUT: JsaLocationLayout = {
  schemaVersion: 1,
  locationsCoveredPlacement: 'after-signature',
  locationDifferencesPlacement: 'after-signature',
};

export function validLocationLayout(value: unknown): value is JsaLocationLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Partial<JsaLocationLayout>;
  return v.schemaVersion === 1 &&
    (v.locationsCoveredPlacement === 'after-job-details' || v.locationsCoveredPlacement === 'after-assessment' || v.locationsCoveredPlacement === 'after-signature') &&
    (v.locationDifferencesPlacement === 'after-assessment' || v.locationDifferencesPlacement === 'after-signature');
}

export function resolveLocationLayout(value: unknown): JsaLocationLayout {
  return validLocationLayout(value) ? value : LEGACY_LOCATION_ADDENDUM_LAYOUT;
}

const REFERENCE_HAZARDS = 'As recorded in this JSA’s company assessment.';
const REFERENCE_CONTROLS = 'Follow the controls and work steps recorded in this JSA’s company assessment.';
export function additionHasDifferences(addition: any): boolean {
  if (addition?.conditionsDiffer === true || addition?.taskAssessment) return true;
  if (addition?.conditionsDiffer === false) return false;
  // Legacy additions predate the explicit flag. Only real custom wording is
  // treated as a difference; the old reference placeholders stay compact.
  return Boolean((addition?.hazards && addition.hazards !== REFERENCE_HAZARDS) ||
    (addition?.controls && addition.controls !== REFERENCE_CONTROLS));
}

export function combineLocationLayouts(values: unknown[]): JsaLocationLayout | undefined {
  if (!values.length || values.some(value => !validLocationLayout(value))) return undefined;
  const first = JSON.stringify(values[0]);
  return values.every(value => JSON.stringify(value) === first) ? values[0] as JsaLocationLayout : undefined;
}
