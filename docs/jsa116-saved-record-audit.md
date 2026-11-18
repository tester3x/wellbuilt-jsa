# Build 116 saved JSA audit — November 18, 2026

Read-only device audit completed on Android build 116 (`com.syconik801.jsaapp`). Installed source remains `7dcaaac6dfb0e7819dc7e29b5790bd160e422f58`; no app rebuild or data correction was needed.

| Check | S24 | Fold |
| --- | ---: | ---: |
| Saved cards and corresponding reports opened | 17 / 17 | 40 / 40 |
| Visible black signatures on white | 17 / 17 | 40 / 40 |
| All recorded card locations present in report | 17 / 17 | 40 / 40 |
| Duplicate saved cards found | 0 | 0 |

The totals include one previously created, clearly marked software-test recovery fixture on each phone. All 57 reports were opened through the installed app. Report form dates and signed times were matched to their cards; signature image regions were captured and visually inspected. Card locations were checked against each report's complete location list. The cloud-backed subset (31 Fold and 12 S24 reports) was additionally compared with current Firebase artifact, linked-job and recorded-addition data through the same report renderer: no missing locations or duplicate request identities.

An old inventory had captured the same oldest card with and without its visible action label at different scroll positions. This was an inventory duplication, not two displayed JSAs. The current filtered list and normalized card inventory confirm one card for that entry. Same-day separate signed records remain separate.

Two old Fold test records retain their previously known missing-operator notices. Their signatures and recorded locations passed. They were not repaired or otherwise altered.

Integrity: all 43 existing cloud signed snapshots and snapshot hashes rechecked unchanged. Both software-test fixtures retain their original fields, update times and signature PNGs, with exactly one previously confirmed separate correction each. No signed record edits, new corrections, JSA closure, deletion or printing were performed. Private device captures and customer data remain outside Git.

Build 116 remains installed on both phones. This documentation commit does not change the APK source.
