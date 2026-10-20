/** Explicit transport errors only. Revocation/permission/identity errors are never offline. */
export function isTransientConnection(error:unknown):boolean {
 const code=String((error as any)?.code||'').toLowerCase();
 return ['auth/network-request-failed','functions/unavailable','functions/deadline-exceeded','unavailable','deadline-exceeded','network-request-failed'].includes(code)
  || error instanceof TypeError && /network request failed|failed to fetch|networkerror/i.test(error.message);
}
export function canRestoreVerifiedOffline(input:{error:unknown;uid:string|null;savedUid:string;finalized:boolean;baseline:boolean}):boolean {
 return isTransientConnection(input.error)&&!!input.uid&&input.uid===input.savedUid&&input.finalized&&input.baseline;
}
