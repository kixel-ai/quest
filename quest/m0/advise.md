# [M] Make quest advise manual and offer it in decision prompts

## Goal

Make `quest advise` and `/quest-advise` strictly manual — keeping [kixel-ai/quest#993](https://github.com/kixel-ai/quest/pull/993)'s read-only `agy` runner, sandbox, and `advising` telemetry, while stripping every automatic trigger from review stops and stripping all hands-off advisor authority (`revise` auto-pivots and advisor `--accept`). Whenever a skill prompts the maintainer on a stalled PR, review dispute, or merge pick, offer `/quest-advise` as a choice (replacing `"Rethink it"` and bare `/quest-iterate`, keeping `/quest-iterate` only when the maintainer gives concrete fix instructions).

Non-goals: automatic rung step-up on review stalls ([Score-progress and dispute stall detection](/quest/m0/advise-stop.md)); Neon and Astra as regular review-rung seats ([Add Neon and Astra to top review rungs](/quest/m0/review-third-seat.md)).

## Plan

Decided 2026-11-28 (maintainer, `/quest-plan` raising the bar — reversing the earlier 2026-11-28 decision in [kixel-ai/quest#993](https://github.com/kixel-ai/quest/pull/993) that made `quest advise` automatic at round 3 and let the advisor replace the maintainer on pivots and `--accept`):

- Advisor authority & triggers? ✅ Make `quest advise` / `/quest-advise` manual; use the regular review rung ladder for automatic escalation instead of automatic advisors; strip hands-off advisor pivots and advisor `--accept`; when prompting the maintainer on what to do, offer `/quest-advise` (replacing `"Rethink it"` and bare `/quest-iterate`, keeping `/quest-iterate` only when the maintainer supplies fix instructions) (rejected: automatic round-3 `quest advise`; hands-off advisor pivots; recording advisor `--accept` as passing the land gate).
- Reuse #993 plumbing? ✅ Keep #993's read-only `agy` runner, deny rules, API-list pricing, and `role: "advising"` telemetry (rejected: reverting #993 and rebuilding from scratch).

Why: letting an advisor silently pivot scope or `--accept` findings without the maintainer conflicts with keeping important decisions visible while calibrating agreement metrics. Keeping `quest advise` manual as a clean second-opinion button gives the maintainer on-demand architectural advice while regular rung step-ups handle review escalation.

This decision authorizes the edits needed in `assets/skills/advise.md`, `assets/skills/review.md`, `assets/skills/iterate.md`, `assets/skills/merge.md`, `assets/skills/run.md`, `assets/skills/afk.md`, and `README.md`.

Recommended, for the implementer to confirm:

- **`src/cli/advise.ts` & `assets/skills/advise.md`:**
  - Strip automatic `next apply` / auto-iteration and advisor `--accept` handling: `quest advise` is read-only and always returns its approaches, recommendation, and rationale for the maintainer (or the caller who manually invoked it) to decide.
  - Drop the 1-call-per-branch hard cap (no arbitrary caps; keep per-branch advice history under `.git/quest/advise/` for audit/telemetry and context).
- **`src/core/reviews.ts` & `src/github/review-trust.ts`:**
  - Remove `"findings accepted by advisor"` from `RUN_OUTCOMES` and the land-gate status parser (nothing writes it yet, per `AGENTS.md`'s no-back-compat rule; coordinate with `kixel-ai/kixel.quest` if its pin imported it).
- **`assets/skills/review.md`, `assets/skills/iterate.md`, `assets/skills/merge.md`, `assets/skills/run.md`, `src/cli/review.ts`:**
  - Remove automatic `/quest-advise` invocation at `next decide` in `/quest-review` and `/quest-iterate`, and remove `quest advise` from `nextStep()`'s automatic stop text (stall handling belongs to [Score-progress and dispute stall detection](/quest/m0/advise-stop.md)).
  - In `/quest-merge`, `/quest-review`, and `/quest-run` pick/stall prompts, replace `"Rethink it"` and bare `/quest-iterate` with `/quest-advise` (keeping `/quest-iterate` when the maintainer provides specific fix instructions or answers).

Tests: `quest advise` never prints `next apply` or authorizes `--accept`; `RUN_OUTCOMES` and `review-trust.ts` do not treat advisor acceptance as a passing land status; skill tests verify `/quest-review` and `/quest-iterate` do not auto-invoke `quest advise`, and pick/stall prompts offer `/quest-advise`.

## Related

- [Score-progress and dispute stall detection](/quest/m0/advise-stop.md) - replaces the fixed round-3 stop with score-progress/dispute stalling and rung step-up
- [Add Neon and Astra to top review rungs](/quest/m0/review-third-seat.md) - reuses #993's read-only `agy` runner for regular reviews
- [Raise the decision bar and delete afk merge](/quest/m0/decision-bar-and-afk.md) - removes `afk` decision-taking and tightens review rules
- [Try and promote quest advise](/quest/m1/try-advise.md) - maintainer trial of manual `quest advise`
