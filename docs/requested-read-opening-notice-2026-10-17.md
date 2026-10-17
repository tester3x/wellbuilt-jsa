# Requested read opening notice

Branch `feat/jsa-register-join-code-20260917`, based on fetched `c0d2963` (installed JSA 59 lineage).

The phone showed a legacy-history verification error before automatically reaching Steps & Hazards after foregrounding. Read-only logs showed superseded shift refreshes followed by verified current-shift results. The accepted Start Job handoff already carries `welcomeReadRequestId`; its existing effect opens Steps only after hydration, governed workflow permission and an exact populated request snapshot match. That delayed automatic opening is intentional and does not require the unrelated history retry button.

Changed presentation only: an opening requested read or a checking history lookup now displays a progress notice. The old-history error and retry button appear only for actual history-verification failure states when no requested read is opening. Existing route, authentication, owner, shift and receipt gates are unchanged; no record is completed or acknowledged by the notice.

Validation: full JSA TypeScript check passed; notice state fixtures passed. This change is committed source only and awaits a future JSA APK/device test. WB T 183 is building independently; it does not include this JSA-app change. No HOS, inspection or live JSA record was altered.
