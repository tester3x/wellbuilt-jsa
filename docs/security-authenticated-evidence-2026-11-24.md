# Authenticated signed-evidence audit checkpoint

Source-only coordinated change with Dashboard `jsaLegacyEvidence` and candidate rules, and Tickets invoice owner isolation. Not built, installed or deployed. No signed original or live record was changed.

Legacy signoff and sync now use authenticated, owner-checked, immutable archive/receipt calls. New bound originals freeze their request before local save and reuse a stable ID on retry; background recovery can publish the same validated receipt. Failed delivery retains originals and reports pending. Account switches cannot confirm another owner's upload. Governed prepared/standalone flows remain separate. Ambiguous historical ownership or signed snapshot conflicts remain held locally for recovery.

Validation: 10 client/sync/retention tests, receipt-submission checks, 18 receipt-v2 checks, 6 workflow/history tests and TypeScript passed. Old `test-wbtReadRequest.mjs` still expects the pre-coordinator /start source text (also absent in baseline); this is recorded, not a pass. No JSA retirement guard script exists at scripts/retired-code-guard.cjs. New protocol phone acceptance remains required.

Full migration order, emulator results, limitations and rollback requirements: Dashboard docs/coordinated-evidence-invoice-audit-2026-11-24.md. Backend bridge precedes client canary; immutable rules come last. Legacy PDF/day-status REST projections were removed and must not be treated as persisted signed evidence. No wholesale Functions/rules deployment is safe from these app repositories.
