# Multi-task JSA app checkpoint — 2026-09-15

WIP, not built/installed. Standalone Steps uses an authenticated task picker when company template catalogVersion is 2. Selected published steps, PPE and prepared labels carry through Review/Submit and are archived in the canonical report. Unique acknowledgement ids derive from content hashes. Shared wording assigned to multiple tasks appears once per selected template. Legacy schema 1 remains unchanged. Required-job multi-task entry is explicitly blocked pending receipt/version integration.

Client TypeScript, task assembly fixtures, standalone client boundary tests and document tests pass. Backend branch feat/jsa-standalone-company-access-20260913 checkpoint 003ba638 adds authenticated catalog reads and reference validation. Dashboard task settings branch feat/jsa-multi-task-templates-20260915 includes version publication/migration work.

Remaining: keep task selection frozen across restart/navigation and owner changes; validate picker and canonical create end to end in emulator; required-job task binding; add-later task review; govern Dashboard publication; retries after template retirement; catalog read consistency; device verification. Do not publish schema 2 settings or deploy this build until completed. Existing installed vc46 remains the device candidate. No live signature or acknowledgement was generated.
