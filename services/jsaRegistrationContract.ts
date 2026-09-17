export const JSA_REGISTRATION_SOURCE = 'wbjsa' as const;

export interface JsaRegistrationInput {
  displayName: string;
  legalName?: string;
  companyCode: string;
  passcode: string;
}

export type JsaRegistrationPayload = {
  displayName: string;
  legalName?: string;
  companyCode: string;
  passcode: string;
  source: typeof JSA_REGISTRATION_SOURCE;
};

export interface PendingRegistrationResponse {
  pendingId?: unknown;
  status?: unknown;
}

/**
 * Keep separators while the employee types. The server owns canonical
 * normalization so ABCD-2345, ABCD 2345, and ABCD2345 remain valid inputs.
 */
export function uppercaseCompanyCodeInput(value: string): string {
  return value.toUpperCase();
}

/** Build the exact public registration payload accepted by the governed API. */
export function buildJsaRegistrationPayload(input: JsaRegistrationInput): JsaRegistrationPayload {
  const legalName = input.legalName?.trim();
  return {
    displayName: input.displayName.trim(),
    ...(legalName ? { legalName } : {}),
    companyCode: uppercaseCompanyCodeInput(input.companyCode.trim()),
    passcode: input.passcode,
    source: JSA_REGISTRATION_SOURCE,
  };
}

/** Accept only the governed server's explicit pending response. */
export function pendingRegistrationIdFromResponse(response: unknown): string | null {
  if (!response || typeof response !== 'object') return null;
  const { pendingId, status } = response as PendingRegistrationResponse;
  if (status !== 'pending' || typeof pendingId !== 'string' || !pendingId.trim()) return null;
  return pendingId.trim();
}
