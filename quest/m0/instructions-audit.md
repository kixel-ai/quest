# [L] Ship the instructions audit

## Goal

Quest ships a seventh audit, `instructions`, which `quest init` plants as `[XL] Audit agent instructions` in every repository with a quest tree.
Each run reads every file an agent loads as context, such as `AGENTS.md` at every depth, `CLAUDE.md`, `GEMINI.md`, `CONTRIBUTING.md`, `REVIEW.md`, skills and their descriptions, path-scoped rules, and context hooks inject.
It checks them against the current official guidance of every harness and model the repository's agents run, and against how agents actually followed them.
It then cuts, consolidates, and rewrites rules in its own PR.

Non-goals: classifying agents' mistakes into new rules, which kixel.quest's mistake audit does, so a run adds a rule only where cutting or merging others cannot fix a finding; the model routing tables, which [the model check](/quest/m1/model-check.md) owns; and machine-level instruction files, which the repository holding them audits with its own stub.

## Plan

Decided 2026-11-23 (maintainer, `/quest-plan`):

- Shape? ✅ A shipped audit that every repository plants (rejected: a local recurring quest covering only this repository; drop).
  The reason: the instructions in this repository's `assets/` reach every repository's agents, about 2k sessions a week, so they are the most important thing to get right.
- Size? ✅ `[XL]`, fixed in its `AUDITS` title in `src/core/audit.ts`, as `cost` is fixed at `[L]`.
  The maintainer: "Maybe effort XL is a bit extreme but we do want to spend our tokens here."
- Other audits' sizes? ✅ `code` goes from `[M]` to `[L]`, since a whole-repository code and security sweep in a large repository exceeds M (rejected: only `instructions` changes, resizing the rest from their first runs; `code` and `tree` to XL).
  Change its `AUDITS` title and this repository's stub title. So a resize reaches stubs already planted, `quest audit` prints each audit's shipped title with its size, and `assets/audit.md`'s Next run takes the size from it rather than keeping the stub's: Quest ships one size per audit with no repository config (root README, 2026-11-22).
- How a run changes files? ✅ It edits them in its PR, and lists each edit under `## Waiting` as a `Maintainer:` keep-or-revert item, so the maintainer drops one without rejecting the rest (rejected: proposals only, which the `docs` audit uses and which need a second PR; one approval for the whole PR).
  Nothing changes until the PR lands on those answers, which is the user's agreement `quest context` asks for before a rule changes.
  An answered PR's reverts make a new head that gets a new review, since kept edits may lean on reverted ones; the maintainer wants tokens spent here.
- Cadence? ✅ The other audits' recurrence, unchanged: each run re-created in m(N+1) requiring the milestone it sat in, scheduled a week on (rejected: every two weeks by date with no milestone gate, which the interview first picked; monthly; on each model-table change, which only this repository has).
  Amended at the review checkpoint, after three rounds found that a stub recurring at a fixed path keeps its milestone from ever finishing (`finishedMilestone` in `src/core/rules.ts` waits for a milestone to hold no quest): "do the same as the other audits. I'm fine with n+1" (rejected: teaching `finishedMilestone` to skip date-recurring stubs; patching where the stub goes).
  The interview's two weeks survived the amendment as a delay only until a review found that behind a milestone gate it differs from the pack's week only when a milestone closes within two weeks, too little to earn its own mechanism.
  The maintainer confirmed the pack's week at the pick round.
  Nothing ends it while the repository runs `quest`; `## Skipped audits` opts out.
- First run? ✅ The pack's default: `quest init` plants it in m(N+1) with `Required` on mN, like the other six (rejected: ready at once with no gate; dropping every stub's gate, which the 2026-11-15 pack decision rejected).
- Evidence? ✅ Review findings and `## Caused by` escapes from `quest usage`, the corrections people typed from `quest messages`, and session transcripts on the hosts that run the repository's agents (rejected: PRs and messages only; official guidance only).
  These show rules agents ignore, misread, or never need. `quest eval` is gone (2026-11-23), so a run judges its rewrites from this evidence, not an A/B test.
- `RISK.md`? ✅ Here, any change to the instructions `quest` ships is high, made in this planning PR: `assets/`, `docs/context.md`, `src/cli/rules.ts`, and `SETUP.md` join its `## High` list, as do instructions code plants or injects, and `chore`, then named `trivial`, no longer lands a high change other than a dependency or pin bump.
  ✅ Other repositories: each run checks that `RISK.md` rates changes to instruction files at least medium, as moq-dev/moq's does, and proposes that line where they could land as low or through an `## Automatic` class (rejected: leaving each repository's tiers alone).
- The guide? ✅ The maintainer asked for this audit of every file agents load, checked against "the official guidance for all available models", and picked this plan to merge, which names its edits: that pick is the request `AGENTS.md` wants before this quest edits `assets/AGENTS.md`, `assets/audit.md`, and `assets/audits/`, within the scope this Plan names.

Agent's choices, for the implementer to revisit:

- The name `instructions`, not `context`, which `quest context` already means.
- The guide's Prompting section stays the one list of official guidance links; the definition points at it, and each run refreshes it, so writers outside a run read the same sources.
  This quest's PR extends that list: the per-model Claude prompting pages, Codex's skills and prompting pages and its guide for the newest GPT model, Antigravity's rules page (Antigravity CLI, `agy`, replaced Gemini CLI for most users on 2026-06-18, and `quest review --harness agy` runs it), Gemini CLI's `GEMINI.md` page for those still on it, and the Agent Skills specification.
  Read the pages, don't only link them: fold what they newly say into the guide's Prompting bullets.
- Look for, beyond the guide's Prompting rules: contradictions between files, which models resolve arbitrarily; a rule said twice; rules the code, a hook, or a check already enforces; caution written for older models; emphasis and absolute "never" where there are exceptions; commands and links in instruction files that no longer work; and load budgets, measured per harness as joined from the root to a deep working directory.
  Limits as a research pass read them on 2026-11-23, for the implementer to confirm on each page: Codex stops adding `AGENTS.md` files past `project_doc_max_bytes` (32 KiB by default) and lists skills in about 8,000 characters; Claude Code asks for under 200 lines per memory file and cuts skill descriptions at 1,536 characters; Antigravity truncates each rule file at 24 KB.
  The same pass read that Claude Code skips `AGENTS.md` when a `CLAUDE.md` sits at or above the working directory, where `SETUP.md` says it may not read `AGENTS.md` at all; settle which is current, and fix whichever is wrong.
- `docs` hands agent instruction files to this audit: its scope excludes them and its `AGENTS.md` and `CONTRIBUTING.md` sentence goes, so each file is audited once, and a repository that skips `instructions` has chosen to leave them unaudited.
- Files another repository ships or syncs, such as `quest`'s own rules and skill stubs, are fixed at their source: a run plans a follow-up there instead of editing its copy.
- `assets/audit.md`'s step that proposes an `AGENTS.md` rule under `## Waiting` reads, for this audit, as consolidating: a run adds a rule only where cutting or merging others cannot fix a finding.
- Privacy: `quest messages` and transcripts span every repository on a host. Give `quest messages` a repository filter, so a run never loads another repository's messages, and read only the transcripts of sessions in its own checkouts. Its PR and the stub carry counts and paraphrase, never a quote of a typed message or transcript, as kixel.quest's mistake audit does.
- Each run records as its next run's baseline: the commit it read, each loaded file set's size per harness, each guidance page's read date, and the rules it kept against evidence, so the next run reads what changed since.
- This repository's stub carries in its Plan: everything under `assets/`, `CONTRIBUTING.md`, and `SETUP.md` is in scope, and the audit is the ask `AGENTS.md` wants before editing `CONTRIBUTING.md`, `assets/CONTEXT.md`, `assets/AGENTS.md`, or `assets/skills/`; `assets/CONTEXT.md` stays within the 10,000 characters Claude Code shows of a hook's context; `docs/context.md`, `src/cli/rules.ts`, and the instructions code plants or injects, which `RISK.md`'s from-code bullet names, hold rule text too; and check first that the guidance links all still resolve, as all six did on 2026-11-23.

## Related

- [Model check](/quest/m1/model-check.md) - bumps model ids; a run here reads the guidance of the models it pins
