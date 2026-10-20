/** Read-only home visibility. Never authorizes forms, shifts or submissions. */
export function canBrowseJsaHome(input:{authenticated:boolean;identityReady:boolean;ownerMatches:boolean;inspectionPending:boolean;hasGovernedLaunch:boolean;isolationBlocked:boolean}):boolean {
 return input.authenticated&&input.identityReady&&input.ownerMatches&&!input.inspectionPending&&!input.hasGovernedLaunch&&!input.isolationBlocked;
}
