# Laptop field handoff — September 14

Work from the laptop checkouts below. Do not replace them with the older desktop directories. All checkpoint references were verified against GitHub during departure preparation.

## JSA — laptop Codex

- C:/dev/JSA
- fix/jsa-app-access-handoff-20260913, source a4d0f516b61e522d6c338941448b281df88806fa; clean and pushed before this handoff note.
- vc40 build 1f02e7c0-00fc-4de9-ac15-7ff11294be86: inline company/well search, plus vc39 submitted-record/read/print work. Build in progress at preparation; installation is not yet claimed.
- Installer helper: C:/dev/output/dashboard-audit-20260912/finish-jsa40.ps1. Status/result files use jsa40-build-status.json and jsa40-install-result.json in that directory. It checks source/version, hashes the downloaded APK, and defers installation while JSA is foreground.
- Prior vc39 APK is already local at C:/dev/output/dashboard-audit-20260912/jsa-vc39.apk. ZFold had vc39 installed; S24 had vc34, deferred while JSA was open.
- Field checks: single-field company/well search and scrollable results; Other above keyboard; submitted record Read/Add Location; signature/date; regular/thermal print; settings returns to same print modal. No fabricated signatures or live test acknowledgements.
- Server archive change is already narrowly deployed: jsaStandalone revision jsastandalone-00003-nix, code 11267ba5; backend docs/checkpoint 91cb77ce on feat/jsa-standalone-company-access-20260913 in C:/dev/jsa-standalone-company-access. No further server deploy needed for the inline search change.

## TicketTime — Grok

- C:/dev/TicketTimeExpo-payperiod-png
- feat/pay-rule-builder-scan-center now 2d2df64b31107316a760607c0ce8d8304fd3487d, clean and independently confirmed on GitHub. Grok committed live-camera/period-overlay work during this preparation.
- Previous built candidate: vc31, source 9ea1cf0. Local APK dist/tickettime-preview-vc31-9ea1cf0.apk, SHA256 FC1AA8B6752C65ECCEFF264CB5115798AEE0079E42672809D8FDC0F4DAD2E48D. Does NOT include the newer 2d2df64 scan work. ZFold had vc31, S24 vc26 at preparation.
- Backup only: checkpoint/tt-field-live-scan-20260914 @ 18723e3 captured the in-progress scan files and App.tsx before Grok's commit. It is pushed, untested WIP, and should not be merged over the owner's newer completed checkpoint.
- Branding handoff d6fb7f0 on design/tickettime-brand-handoff-20260914 is pushed; logo and visual instructions are local at C:/dev/tickettime-brand-handoff. Owner branch already includes subsequent visual changes.
- Field work: latest owner's scan-camera flow, period overlay, Review/Ready navigation, handwriting evidence and print checks. Preserve dates, explicit zeros, duplicate identities, templates, centered scans and invoice-only FSC. Never use a preview test to write live payroll.

## Desktop comparison and other owners

- Desktop D:/dev/JSA 646a4bf and D:/dev/_codex_jsa_handoff a9ae301 are ancestors of laptop JSA. Main desktop JSA had no tracked edits; handoff folder has untracked 20260914-lineage evidence.
- Desktop D:/dev/TicketTimeExpo 18753b8 is an ancestor of the current laptop continuation and had no reported changes. Do not restart from that stale clone.
- Desktop inspected read-only through //192.168.1.111/dev. Its directories were NOT reset or switched. Desktop should fetch the named GitHub branches into isolated worktrees. The home share is not a dependency for field work.
- AntiGravity owns WB-T DDJD/photo integration. Canonical combined baseline f233c00 and photo branch 4bc7a69 were preserved separately; they still require owner integration and lifecycle proof. Claude owns Dashboard. Do not mix those repairs into JSA/TicketTime.

## Local tools and artifacts

Android SDK: C:/dev/tools/android-sdk. ADB available on PATH. Java: C:/Program Files/Microsoft/jdk-21.0.12.101-hotspot. Node and Git available on PATH. JSA/TicketTime dependencies and existing APKs are local; no desktop share is needed to inspect or continue source. Cloud builds, GitHub and live Firebase calls still require internet.

If local Gradle is used, set ANDROID_HOME/ANDROID_SDK_ROOT to C:/dev/tools/android-sdk for that process; the default AppData/Local/Android/Sdk path is not this laptop's installation. Do not reinstall or clear phone data to resolve a path issue.

Phones: ZFold RFGL23VJCED; S24 R5CX15HEGQB. Recheck current build/install state before acting because background builds and owner work can advance after this snapshot.
