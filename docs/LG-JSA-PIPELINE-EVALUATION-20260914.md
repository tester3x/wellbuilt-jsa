# Liquid Gold live parser evaluation

Mike supplied current Loading and Unloading sheets and authorized running both through the existing JSA pipeline. Wrapped each original photo in its own PDF; rendered and checked both. No image rewriting or template activation.

Called deployed `parseJsaPdf` in `wellbuilt-sync/us-central1` twice. Both succeeded. Each returned four steps, twelve PPE entries, four prepared entries, and source storage paths. Review sources are `jsa_templates/liquid-gold/review-20260914-loading.pdf` and `review-20260914-unloading.pdf`. Raw responses and input PDFs remain outside Git at `C:/dev/output/lg-jsa-pipeline-20260914`. No template documents or active mirror were written; no signed records changed.

Findings:
- Correct main distinction: Loading has Start Vacuum / Creating Pressure; Unloading has Start Pressure / Creating Vacuum. Watch Load correctly distinguishes tanker/truck from disposal/tank.
- Ten physical hazard/control pairs became only four objects. Multi-row cells were concatenated with newlines. Preserve each pair as its own item.
- Both titles are identical; no machine-readable Loading/Unloading discriminator is returned.
- Contact sections and instructions for recording location-specific hazards are absent from the structured response.
- Minor transcription differences exist, including spelling/capitalization. Preserve source wording rather than treating extraction as exact.
- Dashboard inspected source supports multiple stored templates but activation deactivates all other templates and mirrors only one to `jsa_templates/{companyId}`. The phone reads this mirror. Loading and Unloading require a scoped selection contract, not two hard-coded bodies.
- Phone template fetch currently makes an unauthenticated REST request and silently falls back on failure. Its authenticated company-template path needs review before claiming reliable company-specific selection.

Deployment caution: live function inventory reports source hash `6a0a9030301560c9606b6d179de828ea9b0db835`; the inspected local source's Secret Manager change is not evidence it is live. Live inventory exposed provider credentials in environment metadata and the normal callable accepted requests without an ID token. Inventory was immediately sanitized locally; no credentials committed. Provider credentials need rotation and the parser's company authorization must be reviewed. Do not deploy unrelated Functions or overwrite the live parser from an unproven baseline.

UI continuation: added standard bar to Open JSAs, hid manual add for an already-added well, renamed Duplicate to Use as starting point and redirects an exact company/location/activity match to an existing open record. Existing copy only transfers job details and resets acknowledgements; no signatures copied. TypeScript and existing open-record/client boundary tests pass. Not built or installed.

Remaining approved work: ordinary authenticated app-switch resume; explicit per-location Loading/Unloading through form, append and immutable snapshot contracts; safe two-template activation/selection; parser row pairing/contact/task extraction with current wording preserved. These are not complete in this checkpoint.
