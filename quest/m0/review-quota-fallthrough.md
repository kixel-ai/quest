# [S] quest review falls through past a reviewer at its usage limit

## Goal

When the reviewer `quest review` picks is at its usage limit or logged out, the round runs on the next reviewer in the size's ranking that the latest writer does not avoid, instead of exiting 3 and leaving the PR a draft until the limit resets. The `## Review` record names the reviewer that ran and the one it skipped, with the reason and reset time. `quest review` stops as an outage only when every eligible ranked reviewer is out.

## Plan

Decided 2026-11-16 (user, /quest-plan), after their Codex hit its usage limit and `quest review` on a PR in kixel-ai/rind could not run, since Claude Opus 5.5 wrote it and Opus is the only other reviewer for its size:

- When the picked reviewer is out of quota or logged out:
  - ✅ fall through to the next ranked reviewer the writer does not avoid, and record which ran and why (recommended: the classifiers and splitters in `src/cli/models.ts` already run "the first that can run, past any logged out or at its usage limit")
  - keep stopping the review as an outage until it resets (rejected: a single vendor's quota then blocks every PR it would review, which is how opencode's quota failed every `quest review` on 2026-11-13, per [token waste](/quest/m0/token-waste/README.md))
- ✅ m0 (rejected: m1, m2): outages already block moq-dev's and Kixel's PRs today, on the maintainer's machines and contributors' forks alike.

Guidance:

- `UsageLimitError` (`src/cli/review.ts`) and the login checks (`LOGINS`, `src/cli/agent.ts`) already detect both cases. Detect them before any finding is saved, retry the round on the next eligible entry, and keep the exit-3 path for the last one.
- A reviewer that fell through settles the open findings of the one it replaces, as a writer change already does in `quest review`.
- Decide in the PR whether the shadow reviewer follows the fallback (its model one effort lower) or is skipped for that round, and record why.
- This quest authorizes the matching edit to `assets/skills/review.md`'s outage paragraph ("A reviewer out of quota or logged out is an outage, not a skip"), which `AGENTS.md` otherwise protects: it becomes an outage only when every eligible reviewer is out.
- The fallback order is the size's existing `REVIEWERS` list; [the Cursor reviewer](/quest/m1/cursor-reviewer.md) adds entries to it, so the two compose without either waiting on the other.

## Related

- [Cursor reviewer](/quest/m1/cursor-reviewer.md) - adds a third harness, so Opus-written work has a fallback beyond Codex
- [Model check](/quest/m1/model-check.md) - audits the ranking this falls through
