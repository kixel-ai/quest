# [M] Review attribution in quest usage

## Goal

`quest usage`'s reviewer rows credit each reviewer only with what it did,
so comparing the rungs' models and efforts reads true:

- A seat filled from another rung to reach the vendors its tier needs is
  labeled apart from a seat the run's random draw placed there. Today both
  read `deep rung (up)`.
- A row's rung comes from each of its rounds, not from the latest round of
  the one tally per model and effort. Today a named round of the same
  model and effort can move earlier drawn rounds in or out of a rung's
  sample.
- A later fix under `## Caused by` counts once for each culprit PR, against
  the reviewers of the run that passed that PR's landed head:
  - A PR's later fix is lost today when a newer PR from the same reused
    branch holds the newer tally.
  - Today a fix is also credited to the latest run's reviewers when the
    head landed after changes no run reviewed.
- A low finding stays open in the rollups when the PR landed without a
  run that passed its head. Today, after a one-vendor `--harness` run,
  such a finding counts as settled, though the run lacked the vendors
  `next finish` needs.

Non-goal: records written before reviewer rungs, which carry a shadow
reviewer or a `, second` seat that now reads as named. Nothing reads them
correctly by design, since nothing was in production then.

## Plan

Found by [kixel-ai/quest#858](https://github.com/kixel-ai/quest/pull/858)'s
review. On 2026-11-24 the maintainer moved these usage-report attribution
findings out of that PR and into this follow-up, in two batches, the second
[on its review's second checkpoint](https://github.com/kixel-ai/quest/pull/858#issuecomment-7145478266). That PR keeps one tally per
model and effort (the maintainer's decision of the same day), so label each
round's rung and how it was placed in the round's own record, not in a
second tally.

Recommended approach:

- Record how a seat was placed: drawn, filled for vendor coverage, or named
  by a flag.
- Group reviewer rows by that placement.
- Key later fixes by the culprit PR's number and its passed head, rather
  than by the branch's latest tally.
