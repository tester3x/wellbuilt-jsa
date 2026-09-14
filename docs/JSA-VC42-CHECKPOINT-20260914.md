# vc42 candidate

Includes b8dc3a9: selected Add Location lookup no longer synchronizes unrelated incomplete saves.

Bottom bars now use three equal non-touchable layout slots, compact 88 x 52 buttons, and at least 16 dp bottom clearance (or the larger system inset). The ZFold vc41 UI dump confirmed unequal widths: middle 318 px, More 444 px. Main tabs and submitted record use the shared layout.

Thermal action now requests Nearby Devices permission, opens printer settings if no paired printer is selected, displays preparation stages, and alerts errors instead of only displaying small status text. Returning from settings still reopens the report's printer modal. This improves the no-selection path; the user's physical thermal failure is not yet independently reproduced or certified fixed.

TypeScript, standalone client boundaries, and paper/thermal document checks pass. Device layout, gesture clearance, thermal selection and physical output require retest. No signature, acknowledgement, shift or production record was changed.

vc42 build 9ab6c02c-95ec-4b5f-92a9-7e7239f0fbee canceled before installation after user navigation feedback. Replacement adds local Read this JSA button and Print | Saved JSAs | More bottom bar; reading view has Back to JSA details. Open JSAs remains in More. TypeScript passes.

Follow-up: vc43 (9031e503-2d2b-4d8c-8a8e-ea63e4e4e879) finished before cancellation; not installed. New source routes the current banner to Open JSAs, includes server-verified shift records alongside open standalone records, and opens cards directly in read mode. Details remove duplicate customer/signer, place signing timestamp in the card, and use a fixed-height operator title that shrinks to 14 before wrapping. Closed status is never inferred from signing. TypeScript, document, client and open-record authority checks pass; native display/printing still pending.
