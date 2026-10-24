# Restore the original JSA workflow

The user explicitly rejected both the prepared one-page replacement (M94) and
the M95 imitation. Restore the actual existing screens, not a restyled substitute.
Do not describe M95 as accepted or fully restored.

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
