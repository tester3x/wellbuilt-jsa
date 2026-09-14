# Submitted JSA reading, additions and printing

Source branch: fix/jsa-app-access-handoff-20260913. Backend companion: 11267ba5 on feat/jsa-standalone-company-access-20260913.

Submitted standalone completion and saved-history navigation now open the owned record. Its bottom actions are Print, Read JSA, More. Read is a read-only document with the original signature and later additions clearly separated. Add location/activity is available on open standalone records. Existing customer/activity/PPE are prefilled; a recorded customer cannot be changed by an addition. Open JSAs groups records by their displayed customer and supports explicit standalone closure/end day. Suite shift completion remains on the existing governed path.

New records archive the assessment text displayed during reading. Older records show current reference text explicitly marked as not proof of their original assessment. The canonical standalone service validates archived step IDs against acknowledged IDs. Old local retries retain their previous create format/hash. Original signed content is not overwritten by additions.

Regular printing uses Android's print service. Thermal printing reuses WB-E's native Brother and ESC/POS paths, with 3-inch/4-inch selection in Settings. Returning from printer settings restores the same print modal; paired-device preferences refresh. No inter-page tear-off pause. Brand/model protocol compatibility and physical output remain device checks.

Verification: TypeScript passes; Android Metro export passes; document fixtures cover paper/3-inch/4-inch content, signatures, additions, escaping, immutable rendering and older-record labeling. Standalone client boundary checks: 9. Server memory checks: 46; Firestore emulator: 47 including denied direct database access. Relevant welcome, governed evidence, attestation, form-isolation and location-catalog regression checks pass. Existing PPE keyboard and single-line location layout are preserved.

Four pre-existing TypeScript errors were corrected: an out-of-scope diagnostic variable, Firestore callback type, supported signature WebView dark-mode prop, and Expo's legacy filesystem import for the existing PDF reader.

Build/install and physical read/print verification are pending at this source checkpoint. No test JSA has been submitted to production and no driver acknowledgement was performed by automation. Dashboard/photo work, WB-T and WB-E were not edited.
