# [L] Ship the instructions audit

## Goal

Quest ships a seventh audit, `instructions`, which `quest init` plants as `[XL] Audit agent instructions` in every repository with a quest tree.
Each run reads every file an agent loads as context, such as `AGENTS.md` at every depth, `CLAUDE.md`, `GEMINI.md`, `CONTRIBUTING.md`, `REVIEW.md`, skills and their descriptions, path-scoped rules, and context hooks inject.
It checks them against the current official guidance of every harness and model the repository's agents run, and against how agents actually followed them.
It then cuts, consolidates, and rewrites rules in its own PR.

Non-goals: adding rules from observed mistakes, which kixel.quest's mistake audit does; the model routing tables, which [the model check](/quest/m1/model-check.md) owns; and machine-level instruction files, which the repository holding them audits with its own stub.

## Plan

Decided 2026-11-23 (maintainer, `/quest-plan`):

- Shape? ✅ A shipped audit that every repository plants (rejected: a local recurring quest covering only this repository; drop).
  The reason: the instructions in this repository's `assets/` reach every repository's agents, about 2k sessions a week, so they are the most important thing to get right.
- Size? ✅ `[XL]`, fixed in its `AUDITS` title in `src/core/audit.ts`, as `cost` is fixed at `[L]`.
  The maintainer: "Maybe effort XL is a bit extreme but we do want to spend our tokens here."
- Other audits' sizes? ✅ `code` goes from `[M]` to `[L]`, since a whole-repository code and security sweep in a large repository exceeds M (rejected: only `instructions` changes, resizing the rest from their first runs; `code` and `tree` to XL).
  Change its `AUDITS` title and this repository's stub title; a stub already planted elsewhere is that repository's own, as `quest init` never edits one.
- How a run changes files? ✅ It edits them in its PR, and lists each edit under `## Waiting` as a `Maintainer:` keep-or-revert item, so the maintainer drops one without rejecting the rest (rejected: proposals only, which the `docs` audit uses and which need a second PR; one approval for the whole PR).
  Nothing changes until the PR lands on those answers, which is the user's agreement `quest context` asks for before a rule changes.
- Cadence? ✅ Every two weeks by date, with `## Scheduled` 14 days on and no milestone gate (rejected: monthly; once per milestone, which here would leave months between runs; on each model-table change, which only this repository has).
  Nothing ends it while the repository runs `quest`; `## Skipped audits` opts out.
- First run? ✅ The pack's default: `quest init` plants it in m(N+1) with `Required` on mN, like the other six (rejected: ready at once with no gate; dropping every stub's gate, which the 2026-11-15 pack decision rejected).
- Evidence? ✅ Review findings and `## Caused by` escapes from `quest usage`, the corrections people typed from `quest messages`, and session transcripts on the hosts that run the repository's agents (rejected: PRs and messages only; official guidance only).
  These show rules agents ignore, misread, or never need. `quest eval` is gone (2026-11-23), so a run judges its rewrites from this evidence, not an A/B test.
- `RISK.md`? ✅ Here, any change to the instructions `quest` ships is high, made in this planning PR: `assets/`, `docs/context.md`, and `src/cli/rules.ts` join its `## High` list, and `trivial` no longer lands them.
  ✅ Other repositories: each run checks that `RISK.md` rates changes to instruction files at least medium, as moq-dev/moq's does, and proposes that line where they could land as low or through an `## Automatic` class (rejected: leaving each repository's tiers alone).
- The guide? ✅ The maintainer asked to "check the official guidance for all available models", which is the request `AGENTS.md` wants before this quest edits `assets/AGENTS.md`, `assets/audit.md`, and `assets/audits/`.

Agent's choices, for the implementer to revisit:

- The name `instructions`, not `context`, which `quest context` already means.
- Recurrence: `assets/audit.md`'s Next run follows the definition's own trigger where it names one, and README's audit section says so, so a run never meets two cadences.
  Each run deletes its stub and re-creates it in the highest-numbered milestone whose README has no `Required` or `Scheduled`, which holds no earlier milestone open: `finishedMilestone` (`src/core/rules.ts`) waits for a milestone to hold no quest, so a stub re-created in an earlier one would keep it open forever and hold back the next audits that require it.
  Nothing requires the highest milestone, so later runs stay at the same path there and create no milestone; a milestone added later takes the stub on its next run, up to two weeks on.
- The guide's Prompting section stays the one list of official guidance links; the definition points at it, and each run refreshes it, so writers outside a run read the same sources.
  This quest's PR extends that list: the per-model Claude prompting pages, Codex's skills and prompting pages and its guide for the newest GPT model, Antigravity's rules page (Antigravity CLI, `agy`, replaced Gemini CLI for most users on 2026-06-18, and [the Gemini reviewer](/quest/m0/gemini-reviewer.md) runs it), Gemini CLI's `GEMINI.md` page for those still on it, and the Agent Skills specification.
  Read the pages, don't only link them: fold what they newly say into the guide's Prompting bullets.
- Look for, beyond the guide's Prompting rules: contradictions between files, which models resolve arbitrarily; a rule said twice; rules the code, a hook, or a check already enforces; caution written for older models; emphasis and absolute "never" where there are exceptions; commands and links in instruction files that no longer work; and load budgets, measured per harness as joined from the root to a deep working directory.
  Limits as a research pass read them on 2026-11-23, for the implementer to confirm on each page: Codex stops adding `AGENTS.md` files past `project_doc_max_bytes` (32 KiB by default) and lists skills in about 8,000 characters; Claude Code asks for under 200 lines per memory file and cuts skill descriptions at 1,536 characters; Antigravity truncates each rule file at 24 KB.
  The same pass read that Claude Code skips `AGENTS.md` when a `CLAUDE.md` sits at or above the working directory, where `SETUP.md` says it may not read `AGENTS.md` at all; settle which is current, and fix whichever is wrong.
- `docs` hands agent instruction files to this audit: its scope excludes them and its `AGENTS.md` and `CONTRIBUTING.md` sentence goes, so each file is audited once, and a repository that skips `instructions` has chosen to leave them unaudited.
- Files another repository ships or syncs, such as `quest`'s own rules and skill stubs, are fixed at their source: a run plans a follow-up there instead of editing its copy.
- `assets/audit.md`'s step that proposes an `AGENTS.md` rule under `## Waiting` reads, for this audit, as consolidating: a run adds a rule only where cutting or merging others cannot fix a finding.
- Privacy: `quest messages` and transcripts span every repository on a host. A run reads only sessions in its own repository, and its PR and the stub carry counts and paraphrase, never a quote of a typed message or transcript, as kixel.quest's mistake audit does.
- Each run records as its next run's baseline: the commit it read, each loaded file set's size per harness, each guidance page's read date, and the rules it kept against evidence, so the next run reads what changed since.
- This repository's stub carries in its Plan: everything under `assets/` and `CONTRIBUTING.md` is in scope, despite `AGENTS.md`'s rule against editing them unasked, since the audit is that ask; `assets/CONTEXT.md` stays within the 10,000 characters Claude Code shows of a hook's context; `docs/context.md` and `src/cli/rules.ts` hold rule text too; and check first that the guidance links all still resolve, as all six did on 2026-11-23.

## Related

- [Model check](/quest/m1/model-check.md) - bumps model ids; a run here reads the guidance of the models it pins
