# [S] Tests never touch the host's quest state

## Goal

Every test runs with its own temporary `XDG_STATE_HOME` and `XDG_CONFIG_HOME`, set once in the vitest setup, so no test reads or writes the host's quest state, tokens, or record queue; a test that needs particular state sets its own.

Non-goals: changing the record sender's behavior, and isolating other host directories such as `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or `GH_CONFIG_DIR`.

## Plan

Decided 2026-11-26 (maintainer, `/quest-plan` of a follow-up from [kixel-ai/quest#917](https://github.com/kixel-ai/quest/pull/917)): ✅ as stated, m0 (rejected: also isolating the other host directories; dropping it).

Tests call `main()` in-process with `process.env`. `quest review` then reaches `queue()` in `src/cli/send.ts`, whose `unseenFailure()` reads the host's `~/.local/state/quest/records/failure` and writes `failure.seen`. So `test/review.test.ts`'s "a quest branch is reviewed at its quest's size on the base" fails its `stderr` assertion whenever the host's sender recently failed, such as on a rate limit, and every such run consumes the notice before the host's real sessions show it. The merge group's `just test` runs on the self-hosted runner against that host's state, so this can flake the gate. Caused by [kixel-ai/quest#893](https://github.com/kixel-ai/quest/pull/893), which made `quest review` queue its sessions without the tests isolating state.

Recommended: stub both variables to a fresh temporary directory per test in a setup file beside `test/budget.ts` in `vitest.config.ts`'s `setupFiles`, and drop any per-test stub whose only job was to keep the host's state out. A test that spawns `quest` as a child passes the stubbed environment on already when it builds from `process.env`; check any that build an environment from scratch.

Tests: one test that `XDG_STATE_HOME` and `XDG_CONFIG_HOME` are fresh temporary directories, apart from the host's. Validation, not kept as a test: a `just test` run leaves the host's `~/.local/state/quest` listing and `records/failure.seen` unchanged.
