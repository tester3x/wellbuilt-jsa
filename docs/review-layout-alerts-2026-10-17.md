# Review layout and alert branding follow-up

Branch: `feat/jsa-register-join-code-20260917`, based on installed JSA 60 source.

Review & Submit removes the redundant top safe-area inset below the navigator header and automatic scroll insets. It uses the existing compact summary, smaller section gaps/checklist spacing, a shorter notes box/signature preview, and removes the white Submit footer backing. Submit remains fixed; scrolling remains available for keyboard, larger text, extra locations or contacts rather than clipping those fields.

Audited all app/components Alert.alert calls. Routed them through a shared queued branded host using the current company accent. This covers completion Retry, save/signature errors, settings, history/delete/close confirmations, missing app notices, steps and printing. Callback actions and destructive/cancel semantics are preserved; no native Alert imports remain at those call sites. Existing custom completion and validation modals remain branded.

The photographed Completion not recorded message represents pending server completion after a local save. Branding does not repair that server failure or claim completion; Retry remains required and the driver must not be returned to Tickets as successfully complete without its receipt.

TypeScript, 28 governed evidence tests, opening notice tests, and branded alert queue/callback/migration audit passed. Layout needs phone verification in the next APK. Source only; no new build or installation for this follow-up.
