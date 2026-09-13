# Separate shift-close integration still required

The app-access callback repair does not finish Suite's end-of-shift JSA workflow.

Read-only findings:

- Suite `app/day-summary.tsx` still uses the legacy `acknowledgeShiftJsa` direct Firestore PATCH and `jsaapp://start` with identity/shift hints. This is not the registered-request secure contract.
- Deployed `wellbuilt-sync` lists `jsaRegisterReadRequest`, `jsaGetReadRequest`, `jsaCompleteReadRequest`, `jsaConsumeReadResult`, `jsaPersistGovernedArtifact`, `jsaAcknowledgeJob`, and `jsaResolveCurrentShiftReadEvidence`.
- Source material on Dashboard `origin/deploy/jsa-governed` documents request registration/consumption for WB-T, authenticated JSA get/complete, and server-frozen job/group/period/intent. URI return alone is not completion. Current-period changes can refuse an older registered request.
- The active `C:/dev/wb-dvir-completion-firebase` checkout has an unrelated local edit in `functions/src/sso/ssoCallables.ts`; do not overwrite it or deploy that checkout as a substitute for confirmed live lineage.

Next contract work must explicitly support the agreed shift-close behavior: all owning driver's outstanding operator JSAs for that shift, preserve separate records, close only after their required interactions, allow authorized lingering-record recovery, and verify receipts before Suite closes the gate. Never fabricate a WB-T job/driver/period, silently mark all records complete, or revive the direct database path.

First validate ordinary Suite entry with the new APK, then a real registered test request from an existing job/customer. Mike has been asked which existing test job/customer to use, or to launch the next real JSA when ready. Full signing/completion requires Mike's actual interaction; do not sign for him.

No server code, Firebase rules, shift records, or JSA completion records were changed by this investigation. Exact deployed Functions source lineage still needs verification before any later server implementation/deployment.

## Later request-display restoration

Read-only archive comparison established the deployed register/get/complete/consume source base: 871ef44886c8bcb6a4f150390861f1dc96c859e9 (235/235 src files match). Pending full-read responses lacked wellName, which this app requires. Earlier restoration 5cd438f1 was reused in isolated C:/dev/jsa-request-well-restore, branch fix/jsa-request-well-restore-20260913. ONLY jsaGetReadRequest was deployed from b38e14e7 and verified at revision jsagetreadrequest-00004-nob. Source and compiled changed modules match; peer revisions unchanged. 138 request checks, 14 SSO spine checks, and 15 emulator direct-database denials passed. Rules and production records were untouched.

This resolves a separate job-display contract regression. Suite's shift-close/lingering-JSA contract is still unfinished. See the isolated backend repository's docs/JSA-WELL-RESTORE-20260913.md for exact evidence. User chose Liquid Gold for testing; queued S24 jobs were inspected without acceptance or modification, and user selection is pending.
