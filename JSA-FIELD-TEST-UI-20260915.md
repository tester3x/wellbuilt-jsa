# JSA field-test UI corrections — 2026-09-15

Base e95ff6e, branch fix/jsa-app-access-handoff-20260913. WB-T is reference-only; no WB-S or WB-T files changed.

- New and added-location search lists use the WB-T AutocompleteInput pattern: inline, max 200 height, accent border, compact rows, scrollable with keyboard retained.
- Measured keyboard reveal covers main form, added-location form, and signoff notes/name. It reserves room for search results, handles overlay/native resize, and responds to keyboard size/layout changes.
- Normal add-location uses references to the original company assessment, existing activity and selected PPE. Drivers no longer must author hazards/controls. Optional differences are available; adding a different versioned assessment retains its step acknowledgements.
- One Acknowledge and add location action records the driver's acknowledgement and returns. No separate review page, extra checkbox, or success-dialog dismissal. Does not close the JSA.
- PPE/preparation labels are retained in new local records and resolved in read/print; older unmatched IDs have readable fallback labels. No signature synchronization changes.
- Existing request identity, frozen pending acknowledgements, retries, and server validation remain intact. No backend deployment required.

Checks passed: TypeScript; 4 form-keyboard cases; 5 assessment/label cases; 9 durable-addition cases; existing document paper/thermal cases; existing keyboard geometry checks. Phone layout still needs verification in the new build.
