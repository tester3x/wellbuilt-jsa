# Restore the original JSA workflow

The user explicitly rejected both the prepared one-page replacement (JSA94) and
the JSA95 imitation. Restore the actual existing screens, not a restyled substitute.
Do not describe JSA95 as accepted or fully restored.

The protected `/offline-job` route is now a transport adapter that renders the
original `StepsScreen`, `PpeScreen` and `SignoffScreen` under a validated prepared
request context. Their original UI markup, legal-name/profile signature preload,
preview, preparation switches, notes, footer and completion dialog remain. The
imitation component and its separate navigation helper have been removed.

The adapter revalidates owner/shift/operator and frozen assessment before saving.
It migrates an existing prepared draft into the original attestation scope without
checking any new items. Original submission checks run, then the protected native
record operation atomically saves evidence. Transport failures retain pending work.
Failed local saves stay on the form. An already completed exact request returns to
Tickets rather than creating another JSA. Existing standard online/standalone paths
are preserved. Profile name/signature presentation cache is installation-owner
scoped and only used after a transport failure, never an access denial or as
authentication/JSA authority.

Read-only server audit confirmed today's real first JSA is completed and has an
exact offline receipt. Later prepared grants reference it as the first full read.
No duplicate JSA or missing-read repair is needed. The second Resume-JSA screen
was traced to the agent's ADB launch at 10:04:59. ActivityTaskManager identifies
source UID 2000 (com.android.shell), following the 10:04 arrival. The legitimate
original launch at 09:20:18 came from Tickets and returned completion at 09:21:45.
The agent interrupted live work with a plain app launch; this was not another
Liquid Gold requirement. The user was told and ZFold screen control stopped.
No JSA-policy or Tickets workaround is needed for that interruption.

Validation: TypeScript, adapter/profile lint and final Android export passed.
118 checks passed: protected original-form adapter (5), actual app native prepared
runtime (9), existing form evidence (28), attestation isolation (20), governed job
fields (46), package backgrounds (10). Original Steps/PPE/Signoff StyleSheet
implementations match `2fddefd` exactly. Header/hardware Back routes to the preceding
original screen inside the adapter; submission uses the original completion modal.

Source is ready for an APK and dedicated-device validation. Physical layout and
first-read to acknowledgment offline acceptance are not yet verified for this
artifact. ZFold has Mobile106/JSA95. The user is actively using Tickets; no
network-change permission has been supplied. Do not operate its screen/network
while they work. Use the dedicated test phone first.

## JSA96 test result and narrow transport correction

Build `0318b794-db79-4183-b183-1b62ab7ec93c`, source `9dab3b8`, was installed
only on the S24. Its original review layout, profile legal-name prefill, visible
saved signature and preparation-disabled Submit were confirmed online without
signing/submitting a JSA. A view-only TEST WELL fixture was used, with no jobRef
or server record creation.

A cold start with S24 Wi-Fi/mobile data off exposed a profile-cache failure:
Firebase's callable client wrapped the rejected native fetch as `functions/internal`,
so the presentation cache correctly refused to treat it as a transport failure.
JSA96 was held off ZFold. S24 network settings were restored in a finally block
and verified exactly (airplane 0, Wi-Fi 1, data 1). No ZFold screen/network changes
were made during this test.

The canonical profile read now uses the same SDK-owned bearer and callable JSON
envelope over native fetch, preserving transport errors separately from HTTP and
server refusals. Identity/session/profile validation remains in the canonical
reader. Explicit access denial still cannot use cached profile data. Four new
transport tests, three presentation-cache tests, TypeScript, lint and final Android
export pass. Original JSA screen presentation is unchanged by this correction.
The replacement APK and repeat physical offline cold-start check are complete
as recorded below.

## JSA97 physical verification and installation

Build `93751543-82b0-4117-ac36-18af15692817`, source
`964c750055f05a4ecf2afdeda608089c8792a1f1`, versionCode97, finished successfully.
APK SHA256:
`4901625FF473D2FFA75DD30EC40319F813B2378510C97BB5ABBA66508DBF483E`.

Installed S24 first. The original Review & Submit layout, saved signature strokes,
prefilled legal name, frozen four preparation items, and disabled Submit while
switches are off were visually and structurally verified. Repeated after
force-stop and cold start with S24 Wi-Fi and mobile data disabled. The same saved
signature/name and frozen items appeared offline. Both settings were restored in
a finally block and verified against their original values; airplane mode stayed
off. The first assertion inspected the enabled text leaf instead of its disabled
button parent; corrected the test selector and repeated successfully.

The test was a view-only TEST WELL fixture using the original Signoff module and
a frozen assessment, with no jobRef, signing, submission, job or shift creation.
It does not claim a new on-phone end-to-end protected submission. The protected
adapter/native record/replay and acknowledgment behavior have automated coverage
described above. S24 was returned to JSA home afterward.

Installed the identical JSA97 APK on ZFold while WB M was foreground. Package
manager confirmed97 and WB M remained foreground; JSA was not launched and no
ZFold connectivity was changed. Mobile106 remains installed there. No server
JSA policy or daily full-read evidence was changed.
