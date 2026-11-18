/** Read-only home visibility. Never authorizes forms, shifts or submissions. */
export function canBrowseJsaHome(input:{authenticated:boolean;identityReady:boolean;ownerMatches:boolean;inspectionPending:boolean;hasGovernedLaunch:boolean;isolationBlocked:boolean}):boolean {
 return input.authenticated&&input.identityReady&&input.ownerMatches&&!input.inspectionPending&&!input.hasGovernedLaunch&&!input.isolationBlocked;
}

export function jsaHomeMessage(home:{checking:boolean;error:string;state:null|{offline?:boolean;action:string;shiftState:string}}):string {
 if(home.checking)return 'Checking your shift and JSA…';
 if(home.error||!home.state)return 'Could not verify your shift and JSA.';
 if(home.state.offline)return 'Saved JSA status. Will refresh when connected.';
 if(home.state.action==='resume')return home.state.shiftState==='open'
  ?'Your current shift has an open JSA. Use Resume JSA below.'
  :'You have an open off-shift JSA. Use Resume JSA below.';
 return home.state.shiftState==='open'?'Your shift has no open JSA. Use New JSA below.':'You are off shift. Use New JSA below.';
}
