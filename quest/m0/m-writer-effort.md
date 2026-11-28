# [S] Writer A/B: M on Opus medium against high

## Goal

M quests split between Opus high, M's writer, and Opus medium in a new writer A/B cohort, and the readout decides M's writer effort on 7-day escapes, with first-round findings and mean cost per merged PR, later fixes included, beside them.

Non-goal: other sizes' writers.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups, recorded in [routing evidence](/quest/m0/routing-evidence/README.md)):

- Which arms? ✅ M on Opus medium against high, and the [second-seat ablation](/quest/m0/second-seat-ablation.md) (rejected: S on Opus low against medium; plan-time splitting at L and XL, which would reopen the 2026-11-22 no-split decision and which XL is too rare to sample).
- Metric? ✅ 7-day escapes decide, with first-round findings and cost beside them (rejected: the routing evidence rule of first-round findings at 0.25 per PR, for this arm only).

Why: from 2026-11-09 to 11-21, M PRs written on Opus medium escaped within 7 days at 11% (25 of 221), against 10% (12 of 118) on Opus high, at a median writing cost of $5.83 against $8.93. Rounds were 4.2 against 4.0. Those PRs were not randomized: the table moved M to Opus high on 2026-11-23, so the arms also differ by date and reviewer.

Agent's choices, for the implementer to revisit:

- Start once the [advisor trial readout](/quest/m0/advisor-readout.md) has decided M. If it moves M off Opus high, rewrite this quest for M's new writer or delete it.
- Reuse the `ARMS` and `COHORT` machinery under a new cohort name, so the advisor trial's rows never mix in.
- Read each PR's arm and effort from wherever the writer is recorded when it enrolls: its `Implementer:` lines today, or the session records Kixel Quest's `writers` read answers once [Implementer cutover](/quest/m0/telemetry/implementer-cutover.md) lands. If the cutover lands mid-trial, check that every enrolled PR still reaches the readout under its arm before counting it.
- Sample: detecting a fall from 10% to 5% needs about 430 PRs per arm, three to four weeks at the audit's rate of about 265 merged M PRs a week across the eight repositories, fewer when only armed quests count.

Tests: an M quest draws a stable arm under the new cohort, and the arm reaches `quest usage`'s readout through the writer record in use.

## Required

- [Advisor trial readout](/quest/m0/advisor-readout.md) - frees M's writer arms and decides its writer
- [Escape window](/quest/m0/escape-window.md) - the 7-day escape count the readout decides on
