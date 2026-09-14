# vc41 verification run

Candidate source: 090af79f4ec32750ebb7cb11feb9ceef1e206b66.
EAS Android preview APK: 6ce8f365-5fb2-4e02-8b5a-7d20e28621fe, versionCode 41.

Build was started following Mike's authorization to build and test the complete flow. This candidate includes the company dropdown's attached, non-overlapping placement, inline search, submitted-record reading, location additions, signature display and regular/thermal printing.

## Passed before native build

- TypeScript no-emit.
- Welcome callback and Continue routing (12 + 7 cases).
- Governed form evidence (25 cases), attestation-scope isolation and Job Details isolation (61 cases).
- Catalog entry and well/SWD company scoping.
- Standalone client boundaries (9 cases).
- Paper/3-inch/4-inch document projection, legacy reference labeling, signature/addition inclusion and escaped text.
- Addition report immutability and PPE keyboard offset checks.

These are automated source/fixture checks, not a completed physical-device test.

## Pending physical checks

1. Verify installed APK version/source; retain app data.
2. Company input accepts typing directly. Results start below the field with matching edges; scrolling does not dismiss them. Select once; result remains in the field. Confirm folded and unfolded widths where available.
3. Verify well/SWD selection and company-scoped loading. Do not change a signed record's customer.
4. Verify welcome-to-reading navigation without bypassing acknowledgement. Mike performs any actual safety acknowledgement/signature.
5. Verify Other stays above keyboard, typing and scrolling remain usable, and summary has only one set of column headers.
6. Open an existing submitted JSA, read full content, navigate Back and return through More/Settings without losing the selected record.
7. Verify Add Location prefill and review; Mike acknowledges any real addition. Original signature must remain separate.
8. Test regular print and selected compatible thermal printer. Verify complete footer/signatures/additions and Settings returning to the same print modal.
9. Verify standalone explicit closure and Suite shift-bound completion independently, using an approved test record/shift rather than changing live work silently.

Installer: C:/dev/output/dashboard-audit-20260912/finish-jsa41.ps1. Build status, APK hash and per-phone install results are written to jsa41-build-status.json / jsa41-install-result.json. Installation defers an active foreground JSA. S24 was locked at the start of this run; device access is pending Mike unlocking a phone when parked.
