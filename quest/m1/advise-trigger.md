# [S] A/B the review round that calls the advisor

## Goal

PRs split between arms that call `quest advise` at different review rounds, such as after round 2 against after round 3, and the readout sets the round from 7-day escapes, with total rounds and cost per merged PR, the advisor's included, beside them.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups): "we should run A/B experiments on which round requires an advisor eventually." ✅ m1, after the [advise replay](/quest/m0/advise-replay.md) (agent's choice of placement, following "eventually").

Agent's choices, for the implementer to revisit:

- Pick the arms from the replay's readout. If round-3 advice mostly names directions the agent had already taken by round 2, test round 2 against round 3; if it mostly misleads, test round 3 against no automatic advice.
- Draw the arm per PR from a hash of the repository and PR number, as the [second-seat ablation](/quest/m0/second-seat-ablation.md) does, and record it with the review.
- Decide on 7-day escapes, as the 2026-11-28 decision on the audit's arms set, reporting rounds, `next decide` stops, and advisor spend beside them.

## Required

- [Advise replay](/quest/m0/advise-replay.md) - whether automatic advice helps, and the readout that picks the arms
- [Advise stop](/quest/m0/advise-stop.md) - the stop the arms move
- [Escape window](/quest/m0/escape-window.md) - the 7-day escape count the readout decides on
