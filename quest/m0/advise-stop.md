# [S] Quest review holds the stop until the advisor has run

## Goal

`quest review` prints `next decide` once the branch's third review run with findings is reached, counting every run on the branch across sessions and hosts, and refuses another round past that stop until `quest advise` has run on the branch since the stop. Three runs after the advice's `quest review --new`, a branch still reporting findings stops again, and that second stop hands the PR back to the maintainer. The maintainer's own `--accept` always passes.

Non-goal: the advisor itself, which [advise](/quest/m0/advise.md) builds.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups): ✅ count rounds per branch and refuse past the stop until `quest advise` has run (rejected: per-branch counting only; neither, relying on the skills' text). That decision authorizes the edits it needs to `assets/skills/review.md` and `assets/skills/iterate.md`, whose `next decide` text describes the stop.

Why: in the busiest agent host's transcripts from 2026-11-25 to 11-28, 65 of 210 `next decide` stops were skipped, 37 by running another round and 28 by `--accept` with no pick. The stop counts the session's rounds (`round.round` in `nextStep`), and a session restarts when the reviewer's model or effort changes (a raised tier moves the rung), the base or `REVIEW.md` changes, the last head is gone after a rebase, or the run is on another host than the saved session. kixel-ai/kixel.quest#223's reviewer was on its session's round 4 at the branch's round 9.

Agent's choices, for the implementer to revisit:

- Count each completed review run once, however many seats it ran, from the PR's review runs posted to Kixel Quest, which every host reads; the PR body's `Rounds:` line is no longer written, and the clone-local tallies (`State.tallies`) miss runs made on another host.
- Store each advise call where every host reads it, beside the posted review runs or as a PR comment, not only under the clone-local `.git/quest/advise/`.
- An advise call made before the stop is stale at it. The `next decide` line then prints `quest advise --force`, which the stop authorizes past advise's one-call cap.
- `quest advise` exiting 3, every advisor unavailable, satisfies the stop as an outage, recorded as such, so an outage never blocks the branch for good.
- The maintainer's `--accept` passes at any point; an accept the advisor recommended is recorded as the advisor's, as [advise](/quest/m0/advise.md) plans.

Tests: through that posted-runs read, a two-seat review that changes hosts and heads before its third run prints `next decide` there; another round past the stop is refused until an advise record dated after the stop exists on another host, then allowed; a stale advise call gets `--force` printed; an advise outage satisfies the stop; three runs with findings after the advice's `--new` hand back; the maintainer's `--accept` passes throughout.

## Required

- [Advise](/quest/m0/advise.md) - `quest advise` and its per-branch history
- [Usage reviews](/quest/m0/telemetry/usage-reviews.md) - the client read of a PR's posted review runs across heads, which counts runs made on other hosts
