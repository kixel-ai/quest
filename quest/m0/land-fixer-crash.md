# [M] The land fixer stops crashing on kixel-ai/rind

## Goal

On kixel-ai/rind, a PR the merge queue drops for `failed_checks` gets a land fixer run that ends in a fix, a flaky verdict, or a handback naming what it needs, never `fixer crashed (exit 1)`. A test reproduces the crash's cause and passes after the fix.

## Plan

Planned 2026-11-15 with the maintainer in rind's `/quest-run` of 2026-11-14 and 2026-11-15:

- Every fixer handback that run saw on rind said `Codex land fixer: fixer crashed (exit 1); run /quest-iterate.` (`src/cli/land-fixer.ts`), on kixel-ai/rind#742, #748 (twice), #758 (twice), #786 and #789. The maintainer's session ran `/quest-iterate` by hand each time.
- On kixel-ai/rind#789, `quest-land-rind.service` on nixos logged `fixing 789` at 19:44:40 and `handback 789` at 19:45:46 (host time, 2026-11-15). The journal shows no `quest-land-fixer@` container starting in that minute, while containers did start and finish cleanly at other times. Start there: the launcher through `quest-land-fixer.socket`, or something before it, exits 1 before Codex runs.
- The watcher and the fixer socket run on nixos. Find the cause from the watcher's and the fixer socket's journals, fix it, and keep the handback's stderr tail in the PR comment so the next crash names its cause.
- ✅ m0: the fixer is how [the queue watcher](/quest/m0/queue-watcher/README.md) absorbs the quest-file conflicts GitHub cannot resolve, so a crashing fixer leaves those for a human (rejected: m1).
