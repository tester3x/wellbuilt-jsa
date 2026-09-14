# Standalone additions

The signed standalone JSA stays immutable. Open it from Saved JSAs and choose
Add location / activity (also available on the active standalone card).
Select an assigned oil company to load only its wells; SWDs and manual locations
remain separate. Enter the location, activity, hazards, controls, and PPE, then
review and explicitly acknowledge the addition before doing the work.

The server appends an independently timestamped acknowledgement under the same
owned open record. Original snapshot, job, content hash, and signature are never
rewritten. The endpoint refuses closed records, conflicting retries, stale
review, foreign ownership, and client authority fields. Forty additions is the
bounded record limit. It does not modify governed/shift-bound JSAs.

Saved detail shows additions and offers Print JSA with additions through the
system print service. The existing original report remains intact. This is not
a new thermal printer integration. The form currently requires the driver to
enter the location-specific assessment; it does not auto-generate hazards.

Validation: server build and standalone memory/Firestore emulator tests;
addition HTML preserves the original, includes evidence, and escapes new text;
catalog, Welcome/Continue and standalone release-path regression checks pass;
Android export passes. App TypeScript retains the four existing errors in
signoff, AppSwitcher, SignaturePad and jsaPdf, with none introduced here.

Backend: feat/jsa-standalone-company-access-20260913, jsaStandalone only.
Before deployment all 239 source files from live revision
jsastandalone-00001-laj matched the pre-change server HEAD 467f87f.
No broad Functions, rules, Dashboard, WB-T or photo lifecycle changes.

Device verification pending: open a real standalone save, add a known location
with the driver's own assessment and acknowledgement, reopen and print it;
verify the original signature and both original/additional locations remain.
Do not simulate a production acknowledgement on behalf of the driver.
