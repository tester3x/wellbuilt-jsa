# Ticket operator retained through JSA

The current S24 test's Job Review and saved Firebase invoice both contained the selected operator. The submission warning did not indicate that WB Tickets bypassed its operator selection. Its older protected JSA get projection omitted operator, and JSA's governed well adapter explicitly replaced it with an empty string. The recently added save guard correctly refused that incomplete projection.

The matching server checkpoint is `48d54e82b02018ed381a72b7e4ac56caaf475eb2` in `tester3x/wellbuilt-dashboard`, branch `release/dashboard-dropoff-location-review-20261117`. It returns a bounded operator from the existing owner-verified invoice read.

This client now preserves that field through the protected context parser, display projection, governed well hydration and final save freeze. The prepared offline entry also retains its protected job operator. Governed saves never fall back to operator URL hints. Standalone forms retain their selected operator path. Missing genuine operator data still blocks submission, and existing signed records remain unchanged.

Validation passed: TypeScript; governed job field matrix (50); request lifecycle matrix (100); original prepared flow (6); preparation checks; submit-failure guard. The server's Functions build and governed receipt matrix (142) passed separately.

Committed source only: no new APK, no installation and no backend deployment. JSA 116 remains installed on both phones, and the S24's unsigned form remains open. A matching server/app release is needed to unblock the current test. Include the preceding duplicate preparation-switch cleanup in that release. Do not mark the off-shift Job Complete End JSA path passed yet.
