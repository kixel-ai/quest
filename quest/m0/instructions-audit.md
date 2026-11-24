# [M] Ship the instructions audit

## Goal

Quest ships a seventh audit, `instructions`, which `quest init` plants as `[XL] Audit agent instructions` in every repository with a quest tree.
Each run reads every file an agent loads as context, such as `AGENTS.md` at every depth, `CLAUDE.md`, `GEMINI.md`, `CONTRIBUTING.md`, `REVIEW.md`, skills and their descriptions, path-scoped rules, and context hooks inject.
It checks them against the current official guidance of every harness and model the repository's agents run, and against how agents actually followed them.
It then cuts, consolidates, and rewrites rules in its own PR.

Non-goals: adding rules from observed mistakes, which kixel.quest's mistake audit does; the model routing tables, which [the model check](/quest/m1/model-check.md) owns; and machine-level instruction files, which the repository holding them audits with its own stub.

## Plan

Decided 2026-11-23 (maintainer, `/quest-plan`):

- Shape? ✅ A shipped audit that every repository plants (rejected: a local recurring quest covering only this repository; drop).
  The reason: instructions in this repository's `assets/` load in every agent session of every repository running `quest`, about 2k a week, so they are the most important thing to get right.
- Size? ✅ `[XL]`, fixed in its `AUDITS` title in `src/core/audit.ts`, as `cost` is fixed at `[L]`.
  The maintainer: "Maybe effort XL is a bit extreme but we do want to spend our tokens here."
- Other audits' sizes? ✅ `code` goes from `[M]` to `[L]`, since a whole-repository code and security sweep in a large repository exceeds M (rejected: only `instructions` changes, resizing the rest from their first runs; `code` and `tree` to XL, which sizes by importance rather than effort).
  Change its `AUDITS` title and this repository's `quest/m1/audit-code.md` title.
  `assets/audit.md`'s Next run step 3 keeps a stub's title, so a resize never reaches a stub already planted: have it take the size from the title `quest init` would plant now.
- How a run changes files? ✅ It edits them in its PR, and lists each edit under `## Waiting` as a `Maintainer:` keep-or-revert item, so the maintainer drops one without rejecting the rest (rejected: proposals only, which the `docs` audit uses and which need a second PR; one approval for the whole PR).
- Cadence? ✅ Every two weeks by date: the PR finishing a run re-creates the stub at the same path with `## Scheduled` 14 days on and no milestone gate (rejected: monthly; once per milestone, which here would leave months between runs; on each model-table change, which only this repository has).
  This is the trigger the definition names in place of the pack's per-milestone one.
  Nothing ends it while the repository runs `quest`; `## Skipped audits` opts out.
- First run? ✅ The pack's default: `quest init` plants it in m(N+1) with `Required` on mN, like the other six (rejected: ready at once with no gate; dropping every stub's gate, which the 2026-11-15 pack decision rejected).
  After the first run, the date alone gates it.
- Evidence? ✅ Review findings and `## Caused by` escapes from `quest usage`, the corrections people typed from `quest messages`, and session transcripts on the hosts that run the repository's agents (rejected: PRs and messages only; official guidance only).
  These show rules agents ignore, misread, or never need. `quest eval` is gone (2026-11-23), so a run judges its rewrites from this evidence, not an A/B test.
- `RISK.md`? ✅ Here, any change under `assets/` is high, made in this planning PR, since it reaches every repository at once.
  ✅ Other repositories: each run checks that `RISK.md` rates changes to instruction files at least medium, as moq-dev/moq's does, and proposes that line where they could land as low or through an `## Automatic` class (rejected: leaving each repository's tiers alone).

Agent's choices, for the implementer to revisit:

- The name `instructions`, not `context`, which `quest context` already means.
- The guide's Prompting section stays the one list of official guidance links; the definition points at it, and each run refreshes it, so writers outside a run read the same sources.
  This quest's PR extends that list now: the per-model Claude prompting pages, Codex's skills and prompting pages and its guide for the newest GPT model, Antigravity's rules page (Gemini CLI was replaced by Antigravity CLI, `agy`, which [the Gemini reviewer](/quest/m0/gemini-reviewer.md) runs), Gemini CLI's `GEMINI.md` page, and the Agent Skills specification.
  Read the pages, don't only link them: fold what they newly say into the guide's Prompting bullets.
- Look for, beyond the guide's Prompting rules: contradictions between files, which models resolve arbitrarily; a rule said twice; rules the code, a hook, or a check already enforces; caution written for older models; emphasis and absolute "never" where there are exceptions; and load budgets.
  Measure the budgets per harness, as joined from the root to a deep working directory: Codex silently stops adding `AGENTS.md` files past `project_doc_max_bytes` (32 KiB by default), Claude Code asks for under 200 lines per memory file and cuts skill descriptions at 1,536 characters, Codex lists skills in about 8,000 characters, and Antigravity truncates each rule file at 24 KB.
  A `CLAUDE.md` at or above the working directory stops Claude Code from loading `AGENTS.md`; flag one that is not a pointer to it.
- Files another repository ships or syncs, such as `quest`'s own rules and skill stubs, are fixed at their source: a run plans a follow-up there instead of editing its copy.
- `docs` no longer reviews agent instructions once this ships: drop its `AGENTS.md` and `CONTRIBUTING.md` sentence, so each is audited once.
- Each run records as its next run's baseline: the commit it read, each loaded file set's size per harness, each guidance page's read date, and the rules it kept against evidence, so the next run reads what changed since.
- This repository's stub carries in its Plan: `assets/CONTEXT.md`, the guide, and `assets/skills/` are in scope, despite `AGENTS.md`'s rule against editing them unasked, since the audit is that ask; `assets/CONTEXT.md` stays within the 10,000 characters Claude Code shows of a hook's context; and check first that the guidance links all still resolve, as all six did on 2026-11-23.

## Related

- [Model check](/quest/m1/model-check.md) - bumps model ids; a run here reads the guidance of the models it pins
