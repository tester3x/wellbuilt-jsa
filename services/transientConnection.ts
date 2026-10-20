import {classifyPlatformFailure} from './platformRuntime.generated';
/** Explicit transport errors only. Revocation/permission/identity errors are never offline. */
export function isTransientConnection(error:unknown):boolean {
 return classifyPlatformFailure(error)==='transport';
}
export function canRestoreVerifiedOffline(input:{error:unknown;uid:string|null;savedUid:string;finalized:boolean;baseline:boolean}):boolean {
 return isTransientConnection(input.error)&&!!input.uid&&input.uid===input.savedUid&&input.finalized&&input.baseline;
}
