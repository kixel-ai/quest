# [S] An agent launch finds its CLI after the admission wait

## Goal

`quest agent start` and `quest agent resume` launch whatever the harness CLI on PATH (such as `claude`) is when the host admits the agent, however long the wait, so replacing the launcher meanwhile cannot fail a queued launch.
A CLI missing before the wait still fails at once, without waiting.

## Plan

Decided 2026-11-24 (maintainer, kixel.ai /quest-run): ✅ plan this (rejected: plan only the forge and parked quests); a change to the host's launcher replacement was dropped.

On 2026-11-24 a scheduled dotfiles update on the maintainer's host replaced the `claude` launcher at 00:09, and five agents queued in `quest agent start`'s admission wait then failed with "claude is not installed".
The cause is the opposite of resolving too late: `runAgent` in `src/cli/agent.ts` calls `requireProgram` before `admitAgent`, and `which` in `src/cli/program.ts` returns the candidate's `realpathSync`, so a launch spawns the file the PATH entry pointed to when it was queued. Once that file is replaced, the spawn's ENOENT reads as "is not installed". The deployed build (65fd9e0) and `main` both do this.

- Keep the check before the wait, so a missing CLI fails fast, and resolve again once admitted, spawning that answer; a CLI gone after the wait fails as it does now.
- No other launch has the gap: the land fixer (`src/cli/land-fix.ts`) resolves and spawns with no wait between, and `quest review` runs ungated.

Tests: with a stub CLI whose PATH entry is a symlink, retarget the symlink and delete the old target while `admit` is held, then release it; the launch runs the new target. A CLI absent before the wait fails without calling `admit`.
