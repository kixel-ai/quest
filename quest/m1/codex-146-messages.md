# [XS] quest messages reads Codex 0.146 sessions

## Goal

`quest messages` reads interactive Codex 0.146 sessions, so
`quest messages --since 2026-10-01` succeeds on a host that ran 0.146 rather
than failing with "user turn without Codex's provenance". Turns of an
unknown shape from other versions still fail.

## Plan

Decided 2026-11-17 (maintainer, `/quest-plan` after `/quest-run`): ✅ read
0.146's turns (rejected: skipping any rollout quest cannot read with a
warning, which would let a future format change drop a host's data silently
and reverses [#719](https://github.com/moq-dev/quest/pull/719)'s choice to
fail on unknown shapes; both; dropping it); ✅ m1 (rejected: m0), since the
gap is two days on one host and does not recur.

- Codex 0.146 writes no `content_item_metadata` or `content_item_kinds` on
  user turns, only `turn_id`. On one of the maintainer's hosts, 6
  interactive sessions (2026-10-15 and 16) hold 33 such turns in the window,
  and one aborts the whole run; that kept the host out of the transcript audit
  behind [#764](https://github.com/moq-dev/quest/pull/764). Sub-agent
  sessions of that version are already skipped by their object `source`.
- In those sessions, injected parts open with `<environment_context>` or
  `# AGENTS.md instructions for`, and typed text is a plain part.
- Recommended: for a session whose `session_meta.cli_version` predates
  provenance, treat a part opening with a known 0.146 wrapper as
  harness or `agents_md` and the rest as typed, and keep throwing for a
  turn without metadata from a version that writes it.
