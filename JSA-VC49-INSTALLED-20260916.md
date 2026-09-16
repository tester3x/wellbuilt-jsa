# JSA vc49 installed — 2026-09-16

- Source: b40247ba21c0d97d4e834710dade2001155bd15f
- Branch: fix/jsa-app-access-handoff-20260913
- EAS build: 6124a7bc-7efe-40fd-affb-c1ff6650c745 (finished)
- Package: com.syconik801.jsaapp, version 1.0.0 (49)
- APK: C:/dev/output/jsa-vc49/jsa-preview-vc49-b40247b.apk
- APK SHA256: 552AEB0E23333E376BBB2DC6BF05F29F760E0AE876AEDB324BDE683D93F0B26F
- Signer SHA256: fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459 (matches vc48)
- S24 and ZFold: install -r succeeded, dumpsys verified versionCode 49 on both. No uninstall/data clear or submitted driver acknowledgement.

Includes history error/refresh corrections from e95ff6e plus the UI/addition changes documented in JSA-FIELD-TEST-UI-20260915.md. No WB-S changes and no backend deployment.

Next verification on S24:
1. Open JSA from launcher. Inspect Open JSAs/history; errors must not masquerade as an empty list.
2. On Job Details, type in Job Type, Oil Company, Well/Location. Field plus bounded inline list should remain above keyboard; list scrolling must retain keyboard.
3. Open an existing open standalone JSA, Add location. Existing activity/PPE should remain, with differences collapsed. Select location and Acknowledge and add location; return directly to report, which stays open.
4. Verify readable PPE labels in report. Close/reopen app and confirm same record/addition remain.

Device UX verification remains pending; compilation, automated tests, APK identity and installation are verified.
