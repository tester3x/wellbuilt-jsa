# WB S shift-summary JSA investigation

User reports Shift Complete screen shows JSA pending, Complete JSA Now does nothing, and shift can finish. Screenshot is evidence of displayed status, not proof of an open JSA.

Read-only local inspection: C:/dev/wellbuilt-suite at 05e2d41. Checkout has existing unrelated identity/login edits. Installed WB S lineage has NOT been matched; findings are conditional on local source matching.

app/day-summary.tsx:
- No matching JSA records sets completed:false, rendered as Pending. No explicit distinction between missing/not-required/unverified/pending.
- Visible Complete JSA Now uses a bare jsaapp://start link via dynamic default import and discards failures. It carries no canonical request identity.
- The same file has a separate handleJsaRead with different behavior; do not replace the button with that legacy helper without checking the current canonical SSO/receipt launch path.
- Screen comments say shift already finalized. Its legacy JSA gate applies to logout, not shift finalization. Close returns home.

Next: match installed/current WB S source, verify authoritative requirement/status for completed shift, use canonical supported launch/receipt flow and visible failure feedback, and enforce requirements at correct pre-finalization boundary if company policy requires them. Do not interpret missing data as an open JSA. Do not add a blanket gate or create/acknowledge records for the driver.

No WB S edits, build or installation performed.
