# Required JSA without clock-in — 2026-10-18

Source-only companion to WB T's company-workday JSA gate and server's independent job receipts. Verified required requests no longer require a shiftId in the creation-access decision. Authentication, company permission, exact request and driver ownership remain required. Signoff reads only the governed session's verified optional actual period; a calendar date or stale AsyncStorage shift is never used as the required record's shift identifier. Off-shift records save shiftId null.

Checks: TypeScript passed; required/standalone creation access and governed-read shift-gate checks passed. Governed auth 97, request lifecycle 100 and form evidence 28 checks passed. The existing Job Details isolation test has 60 pass/1 fail on an unchanged index.tsx Return-button source pin; this change does not edit that page. Server checks include full off-shift registration/get/complete/consume, company policy tightening and weekly off-shift acknowledgement reports.

No APK build or install. No server/Hosting/rules deployment. Deploy server changes in dashboard release/dashboard-compact-identity-20261015 before coordinated JSA/WB T APK builds. Existing device shifts and jobs were not touched.
