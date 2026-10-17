# TicketTime weekly forms source handoff

Branch: `feat/jsa-register-join-code-20260917`, based on `aac80e7` matching origin before edits.

Adds a certificate-pinned, read-only TicketTime provider. The private headless refresh uses the existing governed JSA Firebase session and the new backend `jsaWeeklyForms` callable. It does not launch or complete a JSA request. Period-scoped payloads include original IDs, shift/job references, completion method and HTML content digests. WB T acknowledgements preserve their verified first full-read reference. No auth credentials are exported. Native memory expires after two minutes and is cleared on identity changes/logout. The existing signed document renderer explicitly identifies reference text where historical assessment text was not archived.

TypeScript, JavaScript syntax checks and existing strict lifecycle, verified logout/signature, governed artifact queue and auth presentation regression suites passed. Native compilation/device verification remains pending. No APK built/installed. Backend callable must be deployed and TicketTime + WB E companion source updates shipped before end-to-end testing. Detailed handoff: TicketTime `docs/weekly-work-forms-2026-10-16.md`.
