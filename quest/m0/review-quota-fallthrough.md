# [M] quest review falls through past a reviewer at its usage limit

## Goal

When the reviewer `quest review` picks is at its usage limit, logged out, or not installed, the round runs on the next reviewer in the size's ranking that the latest writer does not avoid, instead of exiting 3 and leaving the PR a draft until the limit resets. Each size ranks a third reviewer, so Opus-written and Sol-written work both have one to fall to. The `## Review` record names the reviewer that ran and the one it skipped, with the reason and reset time. `quest review` stops as an outage only when every eligible ranked reviewer is out.

## Plan

Decided 2026-11-16 (user, /quest-plan), after their Codex hit its usage limit and `quest review` on a PR in kixel-ai/rind could not run, since Claude Opus 5.5 wrote it and Opus is the only other reviewer for its size:

- When the picked reviewer is out of quota or logged out:
  - ✅ fall through to the next ranked reviewer the writer does not avoid, and record which ran and why (recommended: the classifiers and splitters in `src/cli/models.ts` already run "the first that can run, past any logged out or at its usage limit")
  - keep stopping the review as an outage until it resets (rejected: a single vendor's quota then blocks every PR it would review, which is how opencode's quota failed every `quest review` on 2026-11-13, per [token waste](/quest/m0/token-waste/README.md))

Decided 2026-11-17 (maintainer, [moq-dev/quest#761](https://github.com/moq-dev/quest/pull/761#issuecomment-6942626871)):

- ✅ stays in m0 and adds a third ranked reviewer per size from a model already supported, such as Claude Sonnet 5.5, scored with `quest eval run` as `AGENTS.md` requires (rejected: m1 behind the Cursor reviewer; keep as planned; pull the Cursor reviewer into m0). Today `REVIEWERS` in `src/cli/models.ts` lists only Codex Sol and Claude Opus per size, so for Opus-written work the fallthrough had nothing to fall to: that is the rind stall above.

Guidance:

- Third reviewer: append Claude Sonnet 5.5 to each size's `REVIEWERS`, last, at the effort the eval supports (start from one step below the size's Opus entry, never below low). Run `quest eval run` with the base's build and the head's, and put both scores, the per-size catch rates, and their cost in the PR's `## Validation`. If Sonnet catches too little at some size to be worth a review, say so there and recommend another supported model instead of shipping a reviewer that rubber-stamps.
- Fall through only on a failure the provider or launcher reports as a usage limit or a missing login (`ReviewLimitError` and the `unauthorized` patterns in `src/cli/review.ts`, the login checks in `LOGINS` in `src/cli/agent.ts`), or a reviewer CLI that is not installed, all detected before any finding is saved. Text in the diff or in a reviewer's response, such as "usage limit", never changes the reviewer: match only the launcher's exit status, the CLI's structured error, or its login check.
- Separate reviewer unavailability from input errors: today `prepare()` and `turn()` throw `ReviewInputError` for auth failures and a missing CLI (`requireProgram`) alongside a dirty tree, a bad `--branch`, or a malformed `RISK.md`. Give unavailability its own error type, so only it falls through and input errors still exit 2.
- An explicit `--harness` or `--model` names the reviewer: it never falls through, and fails as an outage, so a controlled run such as `quest eval run` cannot silently measure a different model.
- Detect the outage before the round starts where the login check allows, and retry the round on the next eligible entry; keep the exit-3 path for the last one.
- A reviewer that fell through settles the open findings of the one it replaces, as a writer change already does in `quest review`.
- Record the skipped reviewer outside the `- Reviewer:` blocks of `## Review`, such as a `- Skipped: <harness>, <model>, <effort> effort: <reason>, resets <time>` line in the header block, since `parseReview()` in `src/cli/review-record.ts` splits on `- Reviewer:` and throws on a block without a session. Update `parseReview()` and `quest usage` together if the format needs them to read it.
- Decide in the PR whether the shadow reviewer follows the fallback (its model one effort lower) or is skipped for that round, and record why.
- This quest authorizes the matching edit to `assets/skills/review.md`'s outage paragraph ("A reviewer out of quota or logged out is an outage, not a skip"), which `AGENTS.md` otherwise protects: it becomes an outage only when every eligible reviewer is out.
- Update `quest review --help` and the README's reviewer list for the third entry and the fallthrough.
- The fallback order is the size's `REVIEWERS` list; [the Cursor reviewer](/quest/m1/cursor-reviewer.md) may add entries to it, so the two compose without either waiting on the other.

## Related

- [Cursor reviewer](/quest/m1/cursor-reviewer.md) - adds a harness whose models may join the ranking
- [Model check](/quest/m1/model-check.md) - audits the ranking this falls through
