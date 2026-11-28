# [M] Second-seat ablation on rungs 3 and 4

## Goal

On rungs 3 and 4 of the reviewer ladder (`S high`, `M medium`, `L low`; `M high`, `L medium`, `XL low`), half of PRs run Sol alone instead of Sol plus the Opus second seat, drawn per PR so every head of a PR stays in one arm. `quest usage` reports each arm's 7-day escapes, first-round findings, the findings only Opus raised, and review cost, so a readout can decide whether the second seat, and the high risk tier that buys it, earns its cost.

Non-goals: rungs 0-2 and 5-6, whose seat counts stay as they are; the Neon third seat, which [review third seat](/quest/m0/review-third-seat.md) owns; writer arms.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups, recorded in [routing evidence](/quest/m0/routing-evidence/README.md)):

- Risk tier? ✅ Keep the model-classified tier and let this ablation decide what its extra seat buys (rejected: a size-only ladder now, keeping path-held high and low auto-land; keeping it with no test). The audit found tier adds no escape signal once size is known: a likelihood-ratio test of size plus tier against size alone gave 10.4 on 9 degrees of freedom (p about 0.3), over the 775 sized and tiered PRs merged 2026-11-09 to 11-21 and at least 7 days old. Within S and M, high-tier PRs escaped about 1.6 times as often as medium ones, which was not significant. At L there was no gap.
- Start and scope? ✅ Start as soon as it ships, on every rung 3 and 4 head, path-held high included (rejected: skipping path-held high heads; waiting for the 2026-12-04 advisor readout).
- Metric? ✅ 7-day escapes decide: a later PR naming it under `## Caused by` opened within 7 days of its merge, open or merged, counted only once 7 days have passed, as [escape window](/quest/m0/escape-window.md) defines and builds for every experiment. First-round findings and cost go beside them (rejected: the routing evidence rule of first-round findings at 0.25 per PR, for this arm only). Detection lag measured by the audit: median 6 days, 75th percentile 25 days, so an unwindowed count undercounts recent PRs.

Agent's choices, for the implementer to revisit:

- Draw the arm from a hash of the repository and PR number, enrolling the PR at its first run on rung 3 or 4 and counting it in that arm through the readout, whatever its later heads' rungs, so a tier the second seat raised does not drop the PR the seat affected. Later heads still get their own rung's seats.
- Record the arm where `quest review` records the review today (the `## Review` record or its successor post under the [telemetry epic](/quest/m0/telemetry/README.md)), so `quest usage` and Kixel Quest read it without a guess.
- Count a finding as only Opus's when no Sol finding on the same head sits in the same file within 10 lines, the rule the routing evidence's shadow pairs used (15 of 15 sampled matches were the same defect).
- Sample: at the audit's base rate of roughly 15% escapes on rungs 3-4, detecting a 5-point rise needs about 900 PRs per arm, about four weeks at the 2026-11-14 to 11-28 rate of about 445 rung 3-4 PRs a week. Read out then, and put the decision to the maintainer with the tally: keep the seat, drop it from rung 3, or drop it from both. Then end the draw.

Audit baseline for the second seat, by PR size, 2026-11-01 to 11-28: Opus high as second seat found 2.2 first-round findings per PR at M for $4.03 a PR, beside Sol 6.2 high's 2.6 for $1.41 as the pick; at L Opus high found 3.7 for $5.19, beside Sol 6.2 xhigh's 3.8 for $2.84. A quarter of Opus's findings were refuted, against 15-18% of Sol 6.2's.

Tests: the draw is stable across heads and tier changes; an arm-B head on rung 3 or 4 runs one seat and `--accept` needs only it; `quest usage` reports each arm's escapes within 7 days, an open fix included, and leaves out PRs merged less than 7 days ago; a PR raised from rung 4 to rung 5 stays in its arm.

## Required

- [Usage reviews](/quest/m0/telemetry/usage-reviews.md) - `quest usage` reads the posted review runs that hold each arm's findings
- [Escape window](/quest/m0/escape-window.md) - the 7-day escape count the readout decides on

## Related

- [M writer effort](/quest/m0/m-writer-effort.md) - the writer A/B decided on the same metric
- [Routing evidence](/quest/m0/routing-evidence/README.md) - the audit readout behind this
