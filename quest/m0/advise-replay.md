# [M] Advise replay on stuck PRs

## Goal

`quest advise` is replayed on a sample of 150 merged PRs that got stuck in review, at the head where the stop fell, and each piece of advice is judged against what happened after: the later rounds, the approach that merged, and any later `## Caused by` fix. The readout gives the share of stuck PRs the advice would have unstuck or set on a better direction, the share it would have misled, and its cost, with a recommendation on applying advice automatically at the stop.

Non-goals: replaying PRs that never got stuck; choosing the trigger round, which the [advisor trigger A/B](/quest/m1/advise-trigger.md) owns.

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` of the agent audit's follow-ups), asked "can you quest-plan to run Neon on each PR that was merged as an advisor to determine if it would have unstuck them? I dont really want to be in the loop; I just want to fix poor directions early":

- Scope? ✅ A sample of 150 stuck PRs, stratified by repository and size, about $400 (rejected: all of about 600 merged since 2026-11-01 with four or more rounds, about $1.5k; every merged PR, about $12k; no replay, measuring live instead). This overrides the 2026-11-23 decision against throwaway evals ([kixel-ai/quest#850](https://github.com/kixel-ai/quest/pull/850)) for this replay only.
- Trigger? ✅ Advise at the round-3 head only (rejected: rounds 1 and 3; rounds 1, 2, and 3).

Agent's choices, for the implementer to revisit:

- Stuck means four or more review rounds on the branch, or a `next decide` stop, among PRs merged since 2026-11-01 in the eight repositories the 2026-11-28 audit read ([routing evidence](/quest/m0/routing-evidence/README.md)). Take the branch's third run's head from the review runs posted to Kixel Quest, each of which names its head, and fall back to the clones' saved rounds under `.git/quest/review/` only where no run was posted: a saved session keeps only its own rounds, so the local state loses the round-3 head of exactly the PRs whose sessions restarted. Fetch the head from `refs/pull/<n>/head`'s history, and count and replace a PR whose head is gone, reporting how many by repository.
- Run `quest advise` read-only on that head with a snapshot of what the agent had then: the quest's Goal and Plan as of that head, the PR body as of the third run (GitHub keeps a body's edit history), and rounds 1-3 only. Keep the current PR body and any later saved round out of its reach, and count each PR whose snapshot cannot be recovered.
- Pin the advisor with `--harness agy --model gemini-4-neon --effort high` and fail rather than fall through, since the maintainer asked about Neon; price each call from the model its record names.
- Judge with Opus high, which reads the advice, the later rounds, the merged diff, and any later fix naming the PR: would it have saved rounds (it names the direction that eventually converged), prevented an escape (it names the cause of a later fix), changed nothing, or misled (it points away from what merged, with no later fix showing the merged approach wrong). Check 20 judgments by hand and report the agreement.
- Neon's list rate is $3 per million input tokens, $15 per million output, and $0.15 per million cached; token-max reads no `agy` transcripts, so price from the token counts advise records.
- Record the readout in this quest's PR and carry its numbers into the [trigger A/B](/quest/m1/advise-trigger.md)'s Plan.

## Required

- [Advise](/quest/m0/advise.md) - `quest advise`, which the replay runs
