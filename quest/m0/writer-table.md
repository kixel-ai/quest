# [S] Writers: M on Opus high, Fable on L's arm and every XL

## Goal

`src/cli/models.ts` routes M quests to Opus 5.5 high with no arm, splits L
quests between arm A, Opus 5.5 high, and arm B, Fable 5.2 medium, and starts
every XL quest on Fable 5.2 high with Opus 5.5 xhigh as its fallback and no
arm. `quest models`, `quest unblocked --json`, the README's routing section,
and the arm notes in the guide and skills say the same.

Non-goal: the reviewer table, which [reviewer table](/quest/m0/reviewer-table.md) owns.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` of an audit of the 1,082 PRs
merged in moq-dev/moq, moq.pro, and quest from 11-14 to 11-22, from
`quest usage --since 2026-11-14 --json` on this host, the CI host, and the
desktop):

- M writer? ✅ Opus high, ending the M arm (rejected: keep the M A/B; Opus
  xhigh). Arm B, Opus high, beat arm A, Opus medium, on first-round
  findings (0.46 against 0.76 per PR, t≈2.0) and review rounds (2.7
  against 3.8, t≈2.3), with fewer later culprits (8% against 12%). Mean
  cost per merged PR, every role's sessions included, was $7.00 against
  $8.45 (bootstrap 95% interval on the difference -$7.87 to +$3.40), and
  later fix PRs cost $0.15 against $1.89 per PR. The median ($5.41 against
  $1.55) hid medium's long tail of rounds.
- Fable as a writer? ✅ An L arm of Opus high against Fable medium
  (rejected: Fable high at L; Fable medium at both L and XL; XL only, as
  before). XL alone gets about 10 merged PRs a week, so its arm needed about
  20 weeks; L gets about 86, deciding a 0.5 difference in first-round
  findings in about 2 weeks and a halved culprit rate (19% to 10%) in
  about 4.
- XL? ✅ Fable high writes every XL quest, Opus xhigh as fallback, ending
  the XL arm (rejected: keep an XL A/B of Opus xhigh against Fable high).
  The maintainer judged XL quests harder, not just bigger, and so unsplittable:
  82% of merged XL PRs (9 of 11) were later named under `## Caused by`,
  drawing 47 fix PRs that cost more than the XL PRs did.
- Pace? ✅ 50/50 on L, falling through to Opus when Fable hits its usage
  limit (rejected: 25% of L on Fable; an API key for Fable overflow). A
  fallen-through quest counts in neither arm, as before.

The M arm's PRs so far stay in the readout's tallies under their arm. An
arm's hash already keys on the quest's path, so an L quest started before
this lands keeps `arm: null`.

## Related

- [Routing evidence](/quest/m0/routing-evidence/README.md) - reads the L arm
