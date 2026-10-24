# Restore the original JSA workflow — work in progress

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
No duplicate JSA or missing-read repair is authorized/needed. The reported second
Resume-JSA screen after arrival/photo is still being traced; do not claim the
server's successful read proves that navigation issue is fixed.

Current checks: TypeScript passes; adapter/profile lint passes. Full Android export,
original-screen workflow regressions, physical layout and first-read→acknowledgment
offline acceptance remain outstanding. Check header/hardware-back behavior,
profile/signature cache warming, draft restoration and completion return carefully.
Do not build/install this WIP yet. The ZFold currently has Mobile106/JSA95; the user
is actively using Tickets, and no network-change permission has been supplied.
