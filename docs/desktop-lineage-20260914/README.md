# Desktop Functions lineage inventory — read-only, 2026-09-14 UTC

Owner: LCGTP owns WB-JSA and overall WB-T integration. AntiGravity owns invoice/photo lifecycle. This is an inventory checkpoint, not a JSA integration or deployment approval. No application source changed or tests/builds/deployments run by this inspection.

## Preservation and branch state
AntiGravity branch fix/photo-lifecycle-safety-20260913 is pushed with upstream tracking to origin at 1c6b6e3996474b5fed7155a5e9c18f854f0de5f5 and clean. Repository tester3x/wellbuilt-dashboard.
Claude's latest confirmed Dashboard release worktree D:/dev/_dash-ss-20260913 remains clean on release/dashboard-final-20260913 at 4ef9bac89a3802a332d4c5adf092afc37d4d1da0. No active Claude JSA integration branch was observed. The latest Claude session ended with the WB-T forensic audit; that audit worktree has since been switched to another forensic branch, so its present branch is not evidence of Claude's current activity.
Fetched and verified JSA origin refs: fix/jsa-request-well-restore-20260913=a4fb493324fc846e9c5ec54bb8c190d559ea80e9; feat/jsa-standalone-company-access-20260913=467f87f26585abf85bc89bed402901040cd73e54. Implementation 8b7dbc87 is the standalone branch's parent. JSA branches diverge at 871ef44886c8bcb6a4f150390861f1dc96c859e9.

## Proven function-specific deployed baselines
Read live Cloud Functions API and generation-pinned source ZIPs. Compared every src file, normalizing CRLF to LF; all counts below have zero differences. This is source equality, not proof of the historical operator's checkout path.

| Live function | Active revision | Matching Git source | src files |
|---|---|---|---:|
| jsaGetReadRequest | jsagetreadrequest-00004-nob | b38e14e7 (source also retained at a4fb4933) | 235 |
| jsaStandalone | jsastandalone-00001-laj | 8b7dbc87 (source also retained at 467f87f2) | 239 |
| jsaPersistGovernedArtifact | jsapersistgovernedartifact-00002-jas | 65683a6b | 237 |
| upsertDriverInvoice | upsertdriverinvoice-00005-qag | bfd89947 | 257 |
| commitDriverPhotoUpload | commitdriverphotoupload-00001-dul | 58d5e5e9 | 289 |

Exact update times, source generations and deployment hashes are in live-targets.json. Live Dashboard inventory: 161 functions and 52 distinct deployment hashes. No single whole-codebase source baseline has been proven. 4ef9bac8 and AntiGravity parent 2b83044a are not substitutes for this per-function inventory. No integration/release branch was created; this branch contains audit documents only.

Important correction to the older Claude forensic: deployed upsertDriverInvoice DOES stamp server closedAt on an existing invoice's nonterminal-to-terminal transition and when creating a specified-id terminal invoice. It deletes client closedAt in other cases. It blocks reopening terminal invoices. The live source matches bfd89947, not the old passthrough-only description. No photo_patch or patchDriverInvoicePhotos exists in that deployed source, and patchDriverInvoicePhotos was absent from the live function list. No lifecycle implementation was changed by this inspection.

## File-level collision matrix
JSA deltas are measured from their shared ancestor 871ef448. Photo delta is exactly 1c6b6e39 versus its parent 2b83044a. Production has multiple source snapshots; there is no universal baseline column that can honestly be represented by one commit.

| File (functions/ prefix unless docs) | JSA well restore | JSA standalone/artifact | AntiGravity | Collision / deployed baseline |
|---|---|---|---|---|
| src/index.ts | Existing receipt exports retained | Adds artifact and standalone exports | Adds patchDriverInvoicePhotos export | Shared export file; coordinate additive wiring. Neither JSA head contains new photo export; AntiGravity head lacks receipt/standalone exports. |
| src/jsaReceipt/jsaReceiptCallables.ts | Adds authorized readInvoice dependency | Adds artifact callable | Untouched | JSA-to-JSA shared file; live lookup matches restore, live artifact/standalone match other lineage. LCGTP owns reconciliation. |
| src/jsaReceipt/jsaReceiptHandlers.ts | Changes handleGetContext and ReceiptDeps | Adds handlePersistArtifact | Untouched | JSA-to-JSA shared file; same split live lineage. |
| src/jsaReceipt/jsaReceiptCore.ts | Adds guarded job display logic | Unchanged | Untouched | Restore-only; proven in live lookup source. |
| src/jsaReceipt/WB-JSA-INTERFACE.md | Changes contract documentation | Unchanged | Untouched | Restore-only. |
| src/jsaReceipt/jsaArtifactCore.ts | Absent on restore head | Added | Untouched | Artifact/standalone lineage only; live artifact baseline 65683a6b. |
| src/jsaReceipt/__tests__/jsaArtifactCore.test.ts | Absent | Added | Untouched | JSA artifact tests; no photo delta. |
| src/jsaReceipt/jsaStandalone.ts | Absent | Added | Untouched | Proven live standalone source 8b7dbc87; LCGTP only. |
| src/jsaReceipt/jsaStandaloneCallable.ts | Absent | Added | Untouched | Proven live standalone source 8b7dbc87; LCGTP only. |
| src/security/index.ts | No JSA delta | No JSA delta | Exports patchDriverInvoicePhotos and mergeDurablePhotos | AntiGravity export-chain ownership. |
| src/security/operational/index.ts | No JSA delta | No JSA delta | Exports patchDriverInvoicePhotos and mergeDurablePhotos | AntiGravity export-chain ownership. |
| src/security/operational/invoiceOps.ts | No JSA delta | No JSA delta | Photo intent, callable, merge and lifecycle protections | Protected implementation; live invoice source bfd89947. No independent replacement. |
| src/security/operational/__tests__/photoLifecycleSafety.emulator.e2e.test.ts | None | None | Added | AntiGravity tests; not executed or certified by this inspection. |
| tools/test-jsaGovernedReceipt.mjs | Updated | None | None | LCGTP tests. |
| tools/test-jsaRequestRulesEmulator.mjs | Added | None | None | LCGTP tests. |
| tools/test-jsaStandalone.cjs | None | Added | None | LCGTP tests. |
| docs/JSA-WELL-RESTORE-20260913.md (repo root) | Added | None | None | Restore deployment evidence. |
| docs/JSA-STANDALONE-20260913.md (repo root) | None | Added | None | Standalone deployment evidence. |

These are file overlaps, not a claim a merge would produce textual conflicts; no merge was attempted. The JSA lookup reads invoices after authorization but does not write invoice/dispatch lifecycle. Same-file export changes do not authorize replacing AntiGravity implementation.

## Boundaries and remaining gates
No JSA code edit, cherry-pick, merge, build, deployment, or competing integration. LCGTP controls further JSA work. Proposed names inferred from AntiGravity exports are upsertDriverInvoice and patchDriverInvoicePhotos; they are NOT an owner-approved/tested deployment target list. No Functions deployment until target baseline, preserved JSA exports, AntiGravity test report, explicit target list and both-owner approvals are established.

Main D:/dev/Dashboard remains fix/gabriel5-recovery-support at f24d2601 with the three pre-existing untracked tools/.mikes24-apply.mjs, tools/.wbm-assign-two.mjs, tools/.wbm-convert.mjs untouched.

Inspection artifacts were inadvertently placed under the existing WB-JSA worktree D:/dev/_codex_jsa_handoff (repair/governed-handoff-2026-08-22 at a9ae301689772f12eadff46a4a3982c232389dfc). Only untracked 20260914-lineage/ was added, no tracked diff. It contains inspection scripts, sanitized metadata, source comparisons and source archives. Archives/source copies remain local and are not committed or pushed. This isolated audit checkpoint preserves only this report and sanitized live metadata; no application files.
