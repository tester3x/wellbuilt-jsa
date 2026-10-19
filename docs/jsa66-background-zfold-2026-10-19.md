# JSA66 background/header ZFold update - 2026-10-19

Requested: build JSA with shared background/header fix, then update-install on ZFold RFGL23VJCED (SM-F966U1) without clearing app data.

Source ce1e260d165af1fe7c869064689de16e482caedf, branch feat/jsa-register-join-code-20260917, preview APK profile, EAS build96f60d7f-8d0d-4965-bd87-db6f6b6f6b20, versionCode66. Submitted and IN_PROGRESS; not installed at this checkpoint. Source is committed/pushed and includes the prior shift-flow, landing and history fixes. Full typecheck passed before submission; earlier visual QA covered12 shared-background/package/viewport combinations.

Before update Android reports com.syconik801.jsaapp version65, appId10361, firstInstallTime2026-08-20 00:36:57. Existing signing/profile retained. No shift/job/JSA submissions or lifecycle operations are part of installation. Private build metadata and device receipts are outside Git under C:/dev/tmp/jsa-background-fix-*.json. Completion/hash/installation proof will follow below.

## Complete and installed

Exact build96f60d7f-8d0d-4965-bd87-db6f6b6f6b20 finished successfully. APK verified as com.syconik801.jsaapp version66 with a valid Android signature before update installation. APK bytes109789712, SHA2561BC4E89CB6D29DC95335C41E1799308237E00E8D53EFD655EBB65ED0B8108854.

Update-installed with adb -s RFGL23VJCED install --no-streaming -r. Android reported Success; dumpsys verified version66 and preserved original appId10361/firstInstallTime2026-08-20 00:36:57. No uninstall, data clear, downgrade or shift/job/JSA action. Private install receipt C:/dev/tmp/jsa-background-fix-jsa-installed.json. Installed and ready for user visual testing; no authenticated flow or signed evidence was simulated. Suite and WB T unchanged.
