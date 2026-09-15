# JSA vc47 preview — built, not installed

Build completed successfully on 2026-09-15. This is the standalone multi-task preview, not a WB-T handoff release.

- App source: `b7741eb8404e6de341d2952e463631c9ecc418c4`, branch `fix/jsa-app-access-handoff-20260913`.
- Backend source: `d1e8fde046e8e4158bb301eae0aeb2b7c71fdbd3`, branch `feat/jsa-standalone-company-access-20260913`.
- Dashboard source: `1c7a2362e063d62c98c6b271a296ba5011b16889`, branch `feat/jsa-multi-task-templates-20260915`.
- EAS build: `3bd5a7d3-dbed-44af-a091-ca3bcf4860a6`, profile `preview`.
- Package verified from APK: `com.syconik801.jsaapp`, versionCode `47`, versionName `1.0.0`.
- APK: https://expo.dev/artifacts/eas/lsv66KXMbO6Omqnxs0xfsaMN2AHY9gq6uv1oYdW1jbE.apk
- Local copy: `C:/dev/output/jsa-vc47/jsa-preview-vc47-b7741eb.apk`.
- APK SHA-256: `0979D0BBEC226F8FE12CADE5A9FBECB6B71544C16DFF083E87974095733E1B02`.
- Signer SHA-256: `fc833ec7502cead7c5f7b0e5e394a2f7958ded629e92edb5ec7ff9522722d459`; verified equal to the retained vc46 APK signer.

No installation, device access, production deployment or live template activation occurred. This preview calls the new authenticated catalog operation before beginning a new standalone read. Integrate its matching backend before live phone testing; do not treat the APK alone as the complete release.

## Verified

- App TypeScript, document paper/3-inch/4-inch projections, task assembly/draft restoration and standalone ownership checks passed.
- Durable additions and print adapter: 9 cases passed.
- Existing governed artifact queue: 90 passed.
- Backend template management: 19 cases passed.
- Existing governed receipt suite: 114 passed, 0 failed. Source rules now explicitly deny governed requests/artifacts; no assertion about deployed rules is made.
- Standalone server: 47 emulator cases passed.
- Full publication → catalog → sign → add task → retirement retry → close flow: 14 emulator checks passed with each source ruleset.
- Dashboard publication transport: 5 assertions passed; full webpack build exported 26 pages.

## Coordinated rollout remains

Review JSA-only patches against accepted current Dashboard source and rules. Callable targets are `jsaManageTemplate`, `jsaStandalone`, and `parseJsaPdf`; no broad Functions deployment. The parser retains its provider secret binding and now verifies template-manager membership. Preserve all other agents' exports, identity changes and routing work.

After integration, test Loading, later Unloading, restart/retry, rereading, signature visibility and both printer formats on a phone. Automated fixture signatures are not driver signatures. WB-T task/version handoff integration remains separate and inactive.
