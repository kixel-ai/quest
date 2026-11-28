# [S] A cached task pass covers the environment the task ran with

## Goal

`quest run` never replays a cached pass for a task whose run would see a
different environment. Today the digest covers only the manifest's
`environment` table (`src/cli/run.ts`, `digestOf`), while every task runs
with the caller's whole environment (`{ ...io.env, ... }`), so
`RUSTFLAGS="-D warnings" quest run` after a plain run reports `cached (hit)`
and never checks the warnings, and a gate workflow that adds a build flag keeps
replaying passes recorded without it.

## Plan

Found by the [v0.27–v0.29 re-review](https://github.com/kixel-ai/quest/pull/989),
replaying [kixel-ai/quest#948](https://github.com/kixel-ai/quest/pull/948)
(Claude Opus medium; Codex's replay raised the same).

- Recommended: run a cached task in a cleared environment, the manifest's
  `environment` plus a fixed list of variables passed through (such as
  `HOME`, `USER`, `TERM`, `TMPDIR`, and what the dev shell and mbx set),
  recorded in the digest by name and value, so nothing outside the key reaches
  the task; an uncached task keeps the caller's environment. This bounds the
  inputs by design, where hashing a list of known build flags would miss the
  next one.
- The same environment contract covers every task whose digest feeds a cached
  one through `after`, since an uncached build that saw a different
  environment writes different output under the same digest; a cached task
  after one that keeps the caller's environment runs uncached.
- Raise the digest's `version` so passes recorded before this miss.
- [Share task results across hosts](/quest/m1/task-cache-remote.md) sends this
  digest to other hosts, so it should land first.

Tests: a pass recorded without `RUSTFLAGS` misses when it is set; a variable
outside the passed-through list never reaches a cached task or a task it
runs after.

## Related

- [Share task results across hosts](/quest/m1/task-cache-remote.md) - sends
  this digest unchanged across hosts
