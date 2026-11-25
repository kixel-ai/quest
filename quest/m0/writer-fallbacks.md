# [S] Codex writes and fixes when Claude can't

## Goal

Each writer list in `src/cli/models.ts`, and the land fixer, falls from Claude to Codex when Claude can't run (CLI missing, logged out, or at its usage limit), so a quest starts on the next vendor instead of waiting for Claude's reset.
The size still sets each entry's model and effort.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan` in [kixel-ai/kixel.quest#104](https://github.com/kixel-ai/kixel.quest/pull/104)): ✅ "Claude/Codex/Gemini for coding … T-shirt size determines model/effort" (rejected: Claude-only writers and fixer, decided earlier the same day in [kixel-ai/quest#827](https://github.com/kixel-ai/quest/pull/827)).

Decided 2026-11-25 (maintainer, on [#898](https://github.com/kixel-ai/quest/pull/898)):

1. ✅ Ship Claude → Codex only: `agy` leaves every writer list and the land fixer, and stays a reviewer only (rejected: keep `agy` as an unsandboxed writer; drop Gemini writing for good). `agy` would write with permission prompts skipped and no OS sandbox, since Antigravity has no sandbox flag. A separate planning PR adds `quest/m1/agy-writer.md`, which adds Gemini once [agy-sandbox](/quest/m0/agy-sandbox.md) exists.
2. ✅ The fixer's "nothing written yet" check counts ignored files, and its Claude reader counts Claude Code's structured quota events, a rejected `rate_limit_event` or a `billing_error` (rejected: accept only the quota events; refute both).
3. ✅ A Codex fallback in `/quest-run` gets a checkout of its own from `quest worktree create`, not the one the coordinator continued in (rejected: reuse that checkout, which Codex refuses).

[#898](https://github.com/kixel-ai/quest/pull/898) does all of this, so it deletes this file before it lands.
