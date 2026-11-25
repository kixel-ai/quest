# [M] Gemini writes after Codex, inside a sandbox

## Goal

Each writer list in `src/cli/models.ts`, and the land fixer, fall from Codex to
Gemini through `agy` when Codex can't run. agy writes inside an OS sandbox that
keeps its writes to its own checkout and its reads to what the reviewer
sandbox allows plus that checkout. A writer launch on a host with Antigravity
installed starts a quest, commits, and stops at its limit like the other
harnesses.

## Plan

Decided 2026-11-25 (maintainer, `/quest-plan`, on
[kixel-ai/quest#898](https://github.com/kixel-ai/quest/pull/898)): ✅ #898
ships Claude, then Codex, and Gemini waits for this quest (rejected: keep agy
as an unsandboxed writer in #898; drop Gemini writing). agy would otherwise
write with permission prompts skipped and no sandbox, since Antigravity has
no sandbox flag. This keeps the 2026-11-22 order of Claude, Codex, then
Gemini, recorded in [writer fallbacks](/quest/m0/writer-fallbacks.md).

Placed in m1: the Codex fallback already keeps quests moving through Claude's
limits, so a third vendor is less urgent than m0's work.

- Extend [agy sandbox](/quest/m0/agy-sandbox.md)'s Seatbelt and
  bubblewrap/Landlock profiles with a writer mode that also allows writes
  under the quest's checkout and Git's object store for it. Refuse agy as a
  writer wherever that sandbox cannot run, as the reviewer does.
- Move agy from `REVIEW_HARNESSES` into `HARNESSES` in `src/cli/agent.ts`, with
  a writer's launch in place of the reviewer's read-only agent.
- Check the launch on a host with Antigravity installed, on both Linux and
  macOS. This covers the launch check
  [kixel-ai/quest#898](https://github.com/kixel-ai/quest/pull/898) deferred.

Tests: with stub harnesses, a writer list whose Claude and Codex entries both
exit 3 starts the quest on agy, and the land fixer does the same. Under the
sandbox, an agy write outside its checkout fails.

## Hosts

- linux - bubblewrap or Landlock
- macos - Seatbelt

## Required

- [agy sandbox](/quest/m0/agy-sandbox.md) - the OS sandbox this extends with a writer mode
- [Writer fallbacks](/quest/m0/writer-fallbacks.md) - the Codex fallback this adds a rung to
