# [S] Codex, then Gemini, write when Claude can't

## Goal

Each writer list in `src/cli/models.ts`, and the land fixer, falls from Claude to Codex and then to Gemini when the entry before it can't run (CLI missing, logged out, or at its usage limit), so a quest starts on the next vendor instead of waiting for Claude's reset.
The size still sets each entry's model and effort.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` in [kixel-ai/kixel.quest#104](https://github.com/kixel-ai/kixel.quest/pull/104)): ✅ "Claude/Codex/Gemini for coding … T-shirt size determines model/effort", writers falling back Claude to Codex to Gemini (rejected: Claude-only writers and fixer, decided earlier the same day in [moq-dev/quest#827](https://github.com/moq-dev/quest/pull/827) and implemented by [Claude writers](https://github.com/moq-dev/quest/pull/832)). Kixel Quest's routing view compares fall-back PRs' rounds and later fixes with Claude's, so the order is measured rather than assumed.

- Keep [Claude writers](https://github.com/moq-dev/quest/pull/832)'s Claude-first land fixer and add the same fallbacks behind it.
- Gemini writes through `agy`, which `quest review --harness agy` runs as a reviewer only: `REVIEW_HARNESSES` in `src/cli/agent.ts` adds it beside `HARNESSES`, so writing moves it into `HARNESSES` and gives it a writer's launch, with tools and a sandbox, in place of the reviewer's read-only agent.
- `/quest-run` falls to a list's next entry only while nothing is written; check that a limit exit (3) moves on to Codex, then Gemini, before leaving a quest unclaimed.

Tests: with stub harnesses, a writer list whose Claude entry exits 3 starts the quest on Codex, and one whose Codex entry also exits 3 starts it on Gemini; the land fixer does the same.
