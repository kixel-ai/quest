# [M] Trim unused skills, controls, and prompt bloat

## Goal

Quest ships only the eight skills that are actually used (`plan`, `run`, `afk`, `start`, `iterate`, `review`, `merge`, and `import`): `export`, `spawn`, `delete`, and `recurring` are removed (with recurring-quest planning folded into `plan`), `## Waits` (`quest waiting`) is folded into `run` and `complete` is retired, `grill` remains internal for composition without an installed stub, and the unused `"pause"` coordinator control is removed from `assets/AGENTS.md`. Redundant prose across `assets/CONTEXT.md`, `assets/AGENTS.md`, and `assets/skills/` is cut so `CONTEXT.md` sits comfortably below Claude Code's 10,000-character hook limit and every composed skill sits comfortably below the 30,000-character `INLINE_LIMIT`. `quest init` cleans up the retired skill stubs and `quest check` validates the eight-skill set.

Non-goals: changing how `/quest-run` waits on pending CI or how `## Waiting` distinguishes PC-local actions (tracked in [Streamline /quest-afk modes, PC-local waits, and pending-CI waits](/quest/m0/afk-and-waits.md)), or changing dialog option rules (tracked in [Mold common maintainer answers into dialog rules](/quest/m0/dialog-options.md)).

## Plan

Decided 2026-11-21 (maintainer, `/quest-plan`, from a 22-day transcript and skill-load audit across three of the maintainer's hosts: 13,435 entries, 2,702 typed messages, 10,733 dialog answers, and a 14-day/7-day skill-load census):

- What does this plan cover?
  - ✅ All four tracks: trim, dialogs, run/afk workflow, and hooks (recommended)
  - Rejected: trim + dialogs only; trim + dialogs + workflow without hooks
- Which skills stay as user-facing installed stubs?
  - ✅ Cut `export`, `spawn`, `delete`, and `recurring`, fold `## Waits` into `run`, retire `complete` and standalone `grill` (8 skills: `plan`, `run`, `afk`, `start`, `iterate`, `review`, `merge`, `import`) (recommended)
  - Rejected: keep `/quest-complete` as a thin no-spawning shortcut (9 skills); keep both `/quest-complete` and `/quest-grill` standalone (10 skills); cut only `export`, `delete`, and `recurring`

Evidence from the 2026-11-21 audit (14-day / 7-day actual loads across three hosts; week-3 user-typed invocations):

- Truncation cliffs: `assets/CONTEXT.md` is at 9,809 / 10,000 chars (98.1%) and composed `quest-complete` is at 29,730 / 30,000 chars (99.1% of `INLINE_LIMIT`).
- Unused or superseded skills: `quest-export` (0 loads in 14d; reversible adoption was dropped in [quest/README.md](/quest/README.md) on 2026-11-13), `quest-recurring` (0 loads in 7d, 4 in 14d; shipped audits already recur via stubs), `quest-delete` (1 load in 7d; 216-byte body), `quest-spawn` (8 loads in 7d, 2 user uses, down from 119 the week before; superseded by `quest-run`), `quest-grill` (1 standalone load in 7d; used as an internal building block).
- `quest-complete` (80 loads in 7d, 13 user uses) existed largely because `run.md` skipped `quest waiting` and punted waiting drafts to `/quest-complete`. Folding `## Waits` into `run.md` makes `/quest-run` the single orchestrator, with a filter argument (such as `no new quests` or `prs`) when the user does not want new quests started.
- Unused coordinator control: `"pause"` in `assets/AGENTS.md` had 0 uses in 22 days (versus `"decisions"` 63, `"finish up"` 58, `"status"` 12).

This quest edits `assets/CONTEXT.md`, `assets/AGENTS.md`, and `assets/skills/`, which the maintainer asked for by planning it.

Agent's choices, for the implementer to revisit:

- Keep `assets/skills/grill.md` (or move it into a private composition block in `src/cli/skills.ts`) so `plan`, `run`, and `iterate` still compose it without installing a `.claude/skills/quest-grill` or `.agents/skills/quest-grill` stub, and without listing `grill` in `quest skill` if it is no longer a user skill.
- Fold the recurring-quest rules (where the next run goes, what gates it, removing a recurring gate's path from `Required` before re-creating it, and shipped audit stubs) into a compact paragraph in `assets/skills/plan.md`.
- Inline the one-line quest-abandonment rule (`quest rm`, repurposing an existing PR if any) into `assets/AGENTS.md`'s `Deletion` section, and replace `/quest-delete` references across skills and docs with plain `delete` / `quest rm` (and update `afk.md` where it pointed to `/quest-complete` on return).
- Remove `examples/export/` if nothing else uses it, update `README.md`, `docs/`, and tests, and verify `quest init` removes the six retired stubs cleanly without touching edited files.
- Follow `quest guide prompting` when trimming `assets/CONTEXT.md`, `assets/AGENTS.md`, and `assets/skills/`: cut repetition and rules already enforced by code or hooks rather than dropping substance.
- Run `just check` and `just test`, and record the before/after character counts of `CONTEXT.md` and every composed skill in the PR's `## Validation`.

## Related

- [Cut agent token waste](/quest/m0/token-waste/README.md) - broader token and context reduction baseline
