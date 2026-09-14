# Add Location loading checkpoint

vc41 device report: Add Location displays "JSA signature or inspection data is incomplete." Mike confirms an active Suite shift. The selected record's workflow and validity have not yet been independently verified.

Found in source: getStandaloneRecord invoked full history synchronization, which attempted every pending standalone create before reading the selected record. One incomplete older save could block an unrelated signed record. This is a confirmed code defect; it is not proof that the selected device record is valid.

Changed selected-record lookup to read only the owned requested save, enforce standalone workflow, and retrieve its canonical record. If that selected save is pending, its full create validation still applies. History sync preserves and skips incomplete local saves rather than allowing them to block remote history or post-addition refresh. Network/auth/server errors still propagate.

Validated TypeScript, client boundary regression (unrelated incomplete save, selected invalid save, ownership, shift workflow, required request), addition report and paper/thermal document checks. No live records changed. Not built or installed; vc41 remains on devices. Retest selected Add Location and identify its workflow before calling the incident resolved. Active Suite shift alone does not prove a JSA is shift-bound.
