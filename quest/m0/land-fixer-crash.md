# [M] The land fixer stops crashing on kixel-ai/rind

## Goal

On kixel-ai/rind, a PR the merge queue drops for `failed_checks` gets a land fixer run that ends in a fix, a flaky verdict, or a handback naming what it needs, never a bare `fixer crashed (exit 1)`. A fixer that does fail hands back with the cause it printed, so the next failure names itself.

## Plan

Planned 2026-11-15 with the maintainer in rind's `/quest-run` of 2026-11-14 and 2026-11-15:

- Every fixer handback that run saw on rind said `Codex land fixer: fixer crashed (exit 1); run /quest-iterate.` (`src/cli/land-fixer.ts`), on kixel-ai/rind#742, #748 (twice), #758 (twice), #786 and #789. The maintainer's session ran `/quest-iterate` by hand each time.
- On kixel-ai/rind#789 the rind watcher logged `fixing 789` and `handback 789` 66 seconds apart, and the maintainer's host journal shows no fixer container starting in that minute, while containers for other runs started and finished cleanly. So the run exits 1 before Codex starts: in Quest's launch of the fixer, or in the host's restricted launcher it calls.
- Here: make the handback comment carry the failed launch's stderr tail and exit reason instead of `crashed (exit 1)` alone, reproduce the failure, and fix it with a regression test where the cause is in Quest's code.
- Where the cause is in the host's fixer service (its socket, container, or credentials), that fix is kixel-ai/dotfiles' work, per this repository's `AGENTS.md`: add it there as a follow-up, record it under this quest's `## Waiting` as `kixel-ai/dotfiles:` with the PR or quest that fixes it, since `## Required` links only quests in this tree, and finish this quest once rind's next dropped PR gets a real fixer run.
- ✅ m0: the fixer is how [the queue watcher](/quest/m0/queue-watcher/README.md) absorbs the quest-file conflicts GitHub cannot resolve, so a crashing fixer leaves those for a human (rejected: m1).
