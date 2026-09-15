# JSA vc47 installed — 2026-09-15

User authorized completing the steps needed for installation.

- App build source: `b7741eb8404e6de341d2952e463631c9ecc418c4` on `fix/jsa-app-access-handoff-20260913`.
- APK SHA-256: `0979D0BBEC226F8FE12CADE5A9FBECB6B71544C16DFF083E87974095733E1B02`.
- Package `com.syconik801.jsaapp`, versionCode 47, versionName 1.0.0.
- Installed with replacement installation on ZFold and S24; both returned Success and package manager reports versionCode 47. Neither app was uninstalled or cleared. No driver signature or acknowledgement was performed.

## Backend

Only `functions:dashboard:jsaStandalone` was deployed to wellbuilt-sync, from backend checkpoint `d1e8fde046e8e4158bb301eae0aeb2b7c71fdbd3` on `feat/jsa-standalone-company-access-20260913`.

Before deployment, downloaded live source was compared to the isolated source. Differences were confined to the expected JSA implementation and index wiring; shared dependencies matched. TypeScript and 46 standalone fixture cases passed again.

Verified active revision: `jsastandalone-00004-yuy`, updated 2026-09-15T22:09:53.675644035Z. Downloaded deployed JSA receipt source matches the checkpoint.

## Scope and next test

No Hosting, rules, parser, template publisher, WB-T, routing or dispatch deployment occurred. Dashboard company template publishing remains a separate rollout. Its source is preserved at `1c7a2362e063d62c98c6b271a296ba5011b16889`; it is not deployed. Multi-template selection can be exercised once that rollout and template publication are completed. Current legacy company template remains usable.

On-phone test: open JSA, read an existing report and verify signature; start a standalone JSA using the current template, submit personally, add a location, reopen the app and verify it remains; check paper and thermal printing. Automated checks and package installation do not establish those interactive tests have passed.
