# [S] Quest review holds the stop until the advisor has run

## Goal

`quest review` prints `next decide` once the branch's third round with findings is reached, counting every reviewer session on the branch rather than the current session's rounds, and refuses another round or `--accept` past that stop until `quest advise` has run on the branch since the stop.

Non-goal: the advisor itself, which [advise](/quest/m0/advise.md) builds.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups): ✅ count rounds per branch and refuse past the stop until `quest advise` has run (rejected: per-branch counting only; neither, relying on the skills' text).

Why: in fedora's transcripts from 2026-11-25 to 11-28, 65 of 210 `next decide` stops were skipped, 37 by running another round and 28 by `--accept` with no pick. The stop counts the session's rounds (`round.round` in `nextStep`), and a session restarts when the reviewer's model or effort changes (a raised tier moves the rung), the base or `REVIEW.md` changes, the last head is gone after a rebase, or the run is on another host than the saved session. kixel-ai/kixel.quest#223's reviewer was on its session's round 4 at the branch's round 9.

Agent's choices:

- Read the branch's round count from the tally the review record already keeps (`Rounds:`), which spans sessions.
- Read whether the advisor ran from the branch's advise history under `.git/quest/advise/`, which [advise](/quest/m0/advise.md) writes, so the check works offline. A run on another host than the advice is refused until its advice reaches this one; say so in the refusal.
- The refusal names `quest advise` and, when the advice was to drop the PR, the maintainer's pick.

Tests: a branch whose third round with findings came from a second session prints `next decide`; another round or `--accept` past the stop is refused until an advise record dated after the stop exists, then allowed.

## Required

- [Advise](/quest/m0/advise.md) - `quest advise` and its per-branch history
