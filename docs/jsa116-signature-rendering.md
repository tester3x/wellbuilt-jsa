# JSA 116 signature rendering

The real Thor report exposed a gap in 115: its original PNG contains light ink on transparency, whereas the new software-test PNG has black ink on an opaque white canvas. Removing all tint fixed the latter but made the former invisible.

The shared display helper now inspects PNG scanline alpha with pure JavaScript, including all five PNG row filters. Only a predominantly empty transparent canvas receives black-ink rendering. Opaque white canvases retain their original pixels. Report, paper/thermal HTML, Settings and native previews use the same decision. The source PNG and signed records are never rewritten. Malformed or unsupported images retain their existing appearance. Inspection is size-bounded and cached for at most 16 images.

Checks: TypeScript; transparent white/black ink and opaque white canvas fixtures across all five row filters; malformed input; immutable report projection; submit failure; recovery; prepared original flow; local/cloud history merging and refresh.

Source reconciliation: freshly fetched all remote branches/tags. Relative to the 115 survey, only the intended active branch moved to its 115 receipt commit. All other remote branch heads are unchanged. Cloud Android inventory tops out at 99; local/reserved/installed evidence is 115. Unpushed other-machine work cannot be inspected remotely.

Device acceptance is recorded separately after the S24-first installation and real Thor verification. No printing or signed-data edits are part of this check.
