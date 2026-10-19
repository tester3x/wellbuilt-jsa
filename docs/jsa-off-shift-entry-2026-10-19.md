# JSA off-shift entry and summary correction - 2026-10-19

Source-only checkpoint. No APK built/installed and no backend deployed for this correction.

Read-only live audit confirmed driver shift authority initialized with no open period and last close 2026-10-18_104947. All four canonical standalone records, including September 22, are closed. No new jsa_active_work_periods record exists for this owner yet. No production records, signatures, acknowledgements or HOS were changed. Private evidence remains outside Git.

The old bottom action derived Resume from local saved rows, not from a verified open work period. Direct app entry displayed the manual form; the Next button remained inside its scroll container. The header was transparent. The legacy home Close and Save action only dismissed a local active card and was not a server closure.

Changed: direct authenticated entry uses a compact JSA landing surface with Open JSAs and Saved JSAs, and explicitly opens standalone form from Job Details. Required job requests retain their existing authenticated request routing and do not become manual forms. Bottom standard is Saved JSAs / Job Details / More, without a local Resume inference. Job Details has a home/back affordance. Next is outside form scrolling. Header is opaque and scroll contents are clipped below it. Removed the old local-dismiss Close action; actual standalone closure remains the server-backed Open JSAs/history route. Screen restoration does not persist the explicit details/new-form switch. Spanish landing copy included.

Validation: full JSA TypeScript check; screen-resume account/request-isolation regression; open-record ownership/verified shift checks; standalone client boundary checks including closed legacy reconciliation; 13 standalone release-path cases passed. New phone UI has not been visually verified; needs a fresh JSA APK. Installed JSA64 remains unchanged.

Companion Suite correction removes obsolete post-shift Complete JSA Now / jsaapp://start action. Missing legacy day-status evidence is explicitly Unverified, not an assertion that the shift owes another JSA. Important limitation: summary still reads the older day-status evidence; this change does not wire a new work-period summary API or claim that missing legacy evidence is completed. First-job policy remains WB T's responsibility. Suite full typecheck and all30 day-summary regression cases passed. Installed Suite74 remains unchanged.

Next device test after new builds: direct off-shift entry -> landing, Saved JSAs -> September22 closed, Open JSAs -> canonical closed history excluded. Then start first eligible WB T job and verify actual new period read/signature, saved link, later acknowledgement and end-shift finalization. Do not start/stop HOS merely to force the test.
