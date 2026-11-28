# [S] Record an advisor's acceptance as the advisor's

## Goal

When `quest advise`'s advisor recommends accepting a review's open findings (verdict `accept`), the agent at the
`next decide` stop accepts them itself, and `quest review --accept` records that acceptance as the advisor's, never
the maintainer's: its posted run's outcome and its `quest review` commit status read `findings accepted by advisor`,
which the land gate passes as it passes the maintainer's acceptance and `quest usage` counts apart from it.

Non-goals: the stop's enforcement, cross-host advise records, and the `QUEST_USER_ASKED` attestation, which
[advise stop](/quest/m0/advise-stop.md) owns.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups: "I don't really want to be in the
loop; I just want to fix poor directions early"): ✅ the advisor's verdict replaces the maintainer's pick at
`next decide` for everything but closing the PR, and an accept the advisor recommended is recorded as the advisor's,
in the posted run and in the `quest review` commit status the GitHub land gate reads, so `quest usage` and the gate
never read it as the maintainer's; the gate lands it as it lands the maintainer's (rejected: keeping pivots and drops
for the maintainer, as decided 2026-11-26; always stop and ask).

The rest of that decision shipped in [kixel-ai/quest#993](https://github.com/kixel-ai/quest/pull/993): `quest advise`,
its `revise`/`accept`/`drop` verdict and `--limit`, and the readers of `findings accepted by advisor` (`RUN_OUTCOMES` in
`src/core/reviews.ts` and the status parser in `src/github/review-trust.ts`). Until this quest lands, an `accept`
verdict prints `next decide` and hands the PR back, since `quest review --accept` would record it as the
maintainer's.

Recommended, for the implementer to confirm:

- `quest review --accept` reads the branch's latest answered call under `.git/quest/advise/` (or wherever
  [advise stop](/quest/m0/advise-stop.md) moves it); when that call's head is the accepted head, its verdict is
  `accept`, and the run carries no `QUEST_USER_ASKED=1` attestation, `runOutcome` in `src/cli/review-record.ts` and
  the status `attestation` record `findings accepted by advisor`.
- `adviceNext` in `src/cli/advise.ts` then prints `next apply: run quest review --accept "<the advisor's rationale>"`
  for an `accept` verdict within the request's limit, and `/quest-advise` and `/quest-review` say so.

Tests: an `accept` verdict on the head records `findings accepted by advisor` in the post and the status, and the land
gate passes it; an attested `--accept`, or one on another head than the advice's, stays the maintainer's.

## Waiting

- kixel-ai/kixel.quest: pins a `quest` commit whose `RUN_OUTCOMES` in `src/core/reviews.ts` includes
  `findings accepted by advisor`, from [kixel-ai/quest#993](https://github.com/kixel-ai/quest/pull/993) on, and
  deploys it, so its Worker stores such a run instead of refusing the post. Check the `quest` pin in
  `kixel-ai/kixel.quest`'s lockfile against that commit.

## Related

- [Advise replay](/quest/m0/advise-replay.md) - measures whether the advice helps
- [Routing evidence](/quest/m0/routing-evidence/README.md) - measures rework, spend, and escapes across routing
  choices
