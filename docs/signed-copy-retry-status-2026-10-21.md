# Completion receipt versus signed-copy archive

The two first-job screenshots show a real distinction the UI previously lost:
completion may already be recorded while the authored signed-copy archive is
still pending. The previous signoff message always said completion was not
recorded, while re-entry used the terminal completion context to show “Already
completed.” Neither screenshot establishes the exact transport failure reason.

The submit result now carries whether completion is recorded. Pending archive
copy explicitly says completion is recorded and the retained signed copy still
needs syncing. Unconfirmed completion is described as unconfirmed, not definitive
proof that the server failed to record it. Retry operates on the existing frozen,
owner-bound queue item instead of validating/resubmitting a possibly-cleared
review form. It cannot require a new signature or invent an acknowledgement.

The completed terminal checks the owner-bound artifact queue before offering a
Tickets return. Pending copies have Retry; blocked copies show assistance needed.
The normal terminal returns when no pending copy remains. Artifact/coverage
requirements are preserved; this is not a bypass for missing proof. English and
Spanish strings are included.

104 artifact queue checks and 36 terminal checks pass. JSA TypeScript passes.
No build, installation or backend deployment. This fixes the misleading/recovery
path in source; the morning network/archive rejection cause is not claimed proven
without the device's original diagnostics.
