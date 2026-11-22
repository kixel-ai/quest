# [M] Streamline /quest-afk modes, PC-local waits, and pending-CI waits

## Goal

Reduce repeated manual prompts during interactive, mobile/travel, and AFK sessions across three coordinated improvements:

1. **`/quest-afk` modes (`assets/skills/afk.md`):** Keep bare `afk` conservative (standing picks only, deferring other merges until [risk-tier guardrails](/quest/m0/benchmark/guardrails.md) earn wider auto-merge), and add two explicit modes: `afk merge` (merge any non-high-risk PR the agent strongly recommends with a clean review and no open decisions, still deferring high-risk or uncertain PRs and quest deletions) and `afk soon` (flush pending decisions in one batch, then automatically enter `afk`).
2. **PC-local vs tap-anywhere waits (`src/core/waiting.ts`, `quest waiting`, `quest check`, `assets/AGENTS.md`, `assets/skills/run.md`):** Distinguish local/PC maintainer actions (such as password-manager unlocks, hardware checks, or local logins) from decisions answerable from any device, with filtering on `quest waiting` so remote/travel sessions skip PC-local waits and `"at my PC"` sessions batch them.
3. **Pending-CI waiting in `/quest-run` (`assets/skills/run.md`):** When no sub-agent is running and every current question is asked, also block with `quest wait` on open PRs whose required checks are still pending (in addition to queued PRs whose merge unblocks a quest) so those PRs get picked in the same session instead of ending early.

Non-goal: changing risk-tier definitions or automatic low-risk merge classes on bare `afk` (owned by [Scale review, CI, and approval to a PR's risk tier](/quest/m0/benchmark/guardrails.md)).

## Plan

Decided 2026-11-21 (maintainer, `/quest-plan`, from a 22-day transcript audit across three of the maintainer's hosts):

- How should `/quest-afk` handle merge authority and pre-AFK decision flushes?
  - ✅ Keep bare `afk` safe; add explicit `afk merge` (non-high-risk, strongly recommended PRs) and `afk soon` (flush decisions then enter `afk`) (recommended)
  - Rejected: make bare `afk` auto-merge high-confidence non-high-risk PRs by default; keep bare `afk` strictly standing-picks-only with no new shorthand
- Should we add PC-vs-decision waits and pending-CI waits in `/quest-run`?
  - ✅ Yes, include both alongside the hook changes (recommended)
  - Rejected: skip pending-CI waits; skip PC-vs-decision waits

Evidence from the 2026-11-21 audit:

- Bare `afk` was typed 115 times (vs `/quest-afk` 5 times), and the maintainer explicitly spelled out variations of "afk merge anything you strongly/confidently recommend" 23 times (16 since 2026-11-14) plus pre-flight decision flushes ("about to board, any decisions needed?") repeatedly while traveling.
- After returning home, the maintainer pasted "anything that needs me, at my PC" across 6 repositories in a row (13 times total since 2026-11-14) because `## Waiting` mixes phone-answerable decisions with PC-only local actions.
- The maintainer typed "any new PRs?" or "any new quests" 41 times (7 since 2026-11-14) because `/quest-run` exited whenever no sub-agent was running and no queued PR unblocked a quest, leaving PRs with 2-minute pending required checks unpicked.

This quest edits `assets/AGENTS.md` and `assets/skills/`, which the maintainer asked for by planning it.

Agent's choices, for the implementer to revisit:

- For PC-local waits in `src/core/waiting.ts`: recognize `Maintainer (PC):` (or `Maintainer (local):`, treating it as `onMaintainer` with a boolean `local` / `pc` field in `quest waiting --json`, plus `--pc` and `--decisions` filter flags on `quest waiting`). Update `quest check` and `assets/AGENTS.md`'s `Format` section to document the syntax, and make `/quest-run`'s `## Waits` instructions respect a `"at my PC"` vs `"remote / away from PC"` argument.
- In `assets/skills/afk.md`: note that bare `afk` (not only `/quest-afk`) activates the skill, define `afk merge` against the PR's recorded risk tier (deferring `high` risk, unreviewed heads, open decisions, follow-up drops, and quest deletions), and define `afk soon` as running `"decisions"` once and then continuing in `afk` without a second prompt.
- In `assets/skills/run.md`: bound pending-CI waits to open, ready-for-review PRs whose required checks are pending and that still need a merge pick (not drafts waiting on outside parties, not skipped PRs, and not optional reviewers), so `/quest-run` still finishes cleanly when nothing actionable is in flight.
- Verify with unit tests for `src/core/waiting.ts` and `quest waiting` filters, plus `just check` and `just test`.

## Required

- [Trim unused skills, controls, and prompt bloat](/quest/m0/trim-skills.md) - folds `## Waits` into `/quest-run` and frees composed skill budget before editing `run.md` and `afk.md`

## Related

- [Scale review, CI, and approval to a PR's risk tier](/quest/m0/benchmark/guardrails.md) - risk tiers define the `high` boundary `afk merge` defers and will widen standing auto-merge separately
