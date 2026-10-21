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
JSA89 build `3d42f259-6eea-4122-a25a-e277a176fd49` finished from source
`80438103db7bf1ebec6e1ba2a6c0ccfc5c894e2f`. Source/profile/project,
package/version, ARM64 ABI, shared account provider and cryptographic signature
were verified. APK SHA256:
`c093c7a45f886c9e834fe5369e6d9930c548b9d1513466514fa2ecf1203ea265`.
Installed on the connected ZFold with `adb install -r`; Package Manager confirms
versionCode 89. No app data was cleared. The first cloud build (88) failed before
compilation because the workspace alias produced the wrong project path; the
successful build used the actual repository path and the same source commit.
No JSA backend deployment was needed. Runtime acceptance of the retry flow and
the morning network/archive rejection cause remain unverified.
