# TicketTime JSA export polling repair — 2026-10-18

Root cause: JsaFormsMemory.read treated an empty pending mailbox (expires=0) as expired and called clear on every TicketTime poll. Each clear advanced revision, so the asynchronous publisher's saved revision never matched. Its false return was ignored. TicketTime consequently waited up to60 seconds and reported unavailable despite successful server replies.

Fix: return null for an empty mailbox before expiry handling. Real expired payloads and explicit logout/account/request clears still invalidate publishers. A failed older task clears only its own revision, never a newer task. Publication failures log sanitized outcome codes.

Validation: actual native mailbox extracted and executed on the JVM. Baseline b1a2ec5 fails with “Polling invalidated the pending writer”; fixed source passes repeated pending polls, successful publication, stale publisher rejection, expiry and older-failure isolation. Run node tools/test-tickettime-mailbox.cjs and --baseline=b1a2ec582f5234649fb25af152e3699f027e2301 for reproduction. JSA TypeScript passes. Read-only replay of current signed weekly forms passed TicketTime's validation; cloud requests were successful, with warm responses around0.2 seconds and cold starts around5–10 seconds.

Source fix only: no APK built/installed, no server deployment, no JSA/shift/HOS mutations. Pair the next JSA APK with TicketTime's independent native reads and progressive work-record UI changes on wip/etc-hos-timesheet. Phone verification is still required.
