export type GovernedStartupState =
  | 'standalone'
  | 'usable'
  | 'raw_session_without_firebase'
  | 'firebase_without_raw_session'
  | 'invalid_raw_session'
  | 'uid_mismatch'
  | 'authority_mismatch'
  | 'baseline_missing_or_mismatched';

export interface GovernedStartupInput {
  rawSessionPresent: boolean;
  session: { uid: string; driverId: string; companyId: string } | null;
  firebaseUid: string | null;
  tokenDriverId: string | null;
  tokenCompanyId: string | null;
  baselineBound?: boolean;
}

export function classifyGovernedStartup(input: GovernedStartupInput): GovernedStartupState {
  if (!input.rawSessionPresent && !input.firebaseUid) return 'standalone';
  if (input.rawSessionPresent && !input.firebaseUid) return 'raw_session_without_firebase';
  if (!input.rawSessionPresent && input.firebaseUid) return 'firebase_without_raw_session';
  if (!input.session) return 'invalid_raw_session';
  if (input.session.uid !== input.firebaseUid) return 'uid_mismatch';
  if (input.session.driverId !== input.tokenDriverId || input.session.companyId !== input.tokenCompanyId) return 'authority_mismatch';
  if (input.baselineBound === false) return 'baseline_missing_or_mismatched';
  return 'usable';
}
