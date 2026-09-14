# vc42 candidate

Includes b8dc3a9: selected Add Location lookup no longer synchronizes unrelated incomplete saves.

Bottom bars now use three equal non-touchable layout slots, compact 88 x 52 buttons, and at least 16 dp bottom clearance (or the larger system inset). The ZFold vc41 UI dump confirmed unequal widths: middle 318 px, More 444 px. Main tabs and submitted record use the shared layout.

Thermal action now requests Nearby Devices permission, opens printer settings if no paired printer is selected, displays preparation stages, and alerts errors instead of only displaying small status text. Returning from settings still reopens the report's printer modal. This improves the no-selection path; the user's physical thermal failure is not yet independently reproduced or certified fixed.

TypeScript, standalone client boundaries, and paper/thermal document checks pass. Device layout, gesture clearance, thermal selection and physical output require retest. No signature, acknowledgement, shift or production record was changed.

vc42 build 9ab6c02c-95ec-4b5f-92a9-7e7239f0fbee canceled before installation after user navigation feedback. Replacement adds local Read this JSA button and Print | Saved JSAs | More bottom bar; reading view has Back to JSA details. Open JSAs remains in More. TypeScript passes.
