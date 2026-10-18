# Older open JSA review and close — 2026-10-18

Manual New JSA and manual Next now inspect the signed-in owner's saved older open standalone records before clearing or advancing the form. Older records route to Open JSAs for review/close. Today's parallel standalone work remains allowed. Governed required-read requests retain their separate owner and route; this change does not close shifts or alter HOS.

Owned legacy records with only a matching driverHash are normalized in memory to the canonical driverId. An explicitly conflicting driverId is refused. Close re-reads the selected owned record (route/caller fields are not authority), verifies the server's exact closed record and owner, and updates that local record without synchronizing/migrating unrelated old drafts. The error message survives the Open JSAs reload instead of being immediately cleared.

Validation: open-record boundary and standalone client suites pass, including prior-date detection, closed/today/shift exclusions, driverHash-only ownership, conflicting owner refusal, selected-record closure, unchanged unrelated drafts, and failed server close retaining open state. JSA TypeScript passes. No APK build/install or backend deployment. No saved JSA was closed/deleted by maintenance.

Specific Sept22 record: not found in the canonical cloud records for the currently tested driver during read-only inspection; release app local storage is not debug-readable. Consequently its exact record format and attempted-close error are not confirmed. The identified client code paths are fixed and regression-tested; verify that record on the phone after the next JSA APK rather than claiming it has been closed.
