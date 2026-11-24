# Signed evidence deletion containment — November 24, 2026

F-09/F-20 / C-2/H-6 verification found a related local loss path: `deleteJSAEverywhere` ignored the cloud helper's failed result and could still remove local saved evidence. History then hid the row regardless of the service's success flag.

Saved reports, including legacy reports with ambiguous provenance, now refuse client deletion at the history action and both service exports. Governed Close for an open standalone JSA remains available and retains the report/additions. No saved record was modified, removed, re-signed or migrated during this work.

Three actual-service regression tests prove refusal before storage/cloud side effects and retained lifecycle Close; TypeScript passed. Source-only: no APK build/install or rule deployment. Live Firestore still allows owner-driver update/delete on `jsas` and its compatibility receipt create/get exception; client containment is not a substitute for backend immutability.

Next release must reconcile authenticated governed submit/replay, owner-bound receipt identity and immutable signed storage with the current native and legacy client paths, then pass the emulator and S24/Fold offline matrix. Do not abruptly close legacy rules and strand evidence. Full coordinated plan: Dashboard `docs/security-audit-verification-2026-11-24.md`.
