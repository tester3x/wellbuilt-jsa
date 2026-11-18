# Shift/JSA device test progress — November 18, 2026

Keep WB JSA 116 and WB Tickets 398 on both phones. No app changes or rebuilds in this test.

Passed on S24: WB JSA home showed Open off-shift JSA and End JSA. Tapped End JSA and confirmed the branded prompt. The card/button disappeared. The matching Firebase active work period became finalized with driver_ended_off_shift. Its shift binding remained null. All 43 existing signed snapshots and snapshot hashes were rechecked unchanged. No printing.

Remaining:

- S24: start a fresh off-shift test job/JSA and test Last Job? End JSA in Job Complete. Confirm job closure and period finalization, without printing.
- Fold: Added / On JSA badges for final pickup/drop-off against the phone's JSA list while on shift; verify no End JSA action is shown on shift.

The live authoritative shift records currently report both drivers off shift. Mike was asked to start the Fold shift for the on-shift test. No shift/HOS event was created by the assistant. Mike was also asked to create the fresh S24 off-shift test JSA needed for its second close path. The S24 was returned to WB Tickets cover for that test. Private device evidence and record identifiers remain outside Git.
