# [M] Routine Claude advisor pairing and writer A/B arms

## Goal

Support Claude Code's built-in server-side advisor tool (`--advisor <model>`,
`advisor_20260301`) in `quest`'s model tables, `quest agent`, `quest usage`, and
session telemetry, and run writer A/B arms across all five T-shirt sizes
(`XS`–`XL`) comparing standalone baselines against `--advisor` pairings so
`routing-evidence` and Kixel Quest can pick the best rung per size from
measured cost and quality.

Non-goals: waiting on T3 Code to expose `advisorModel` (armed advisor quests
dispatch through `quest agent`); changing `quest review`'s reviewer tables;
testing Haiku + Opus advisor (due to Haiku 5.5's 100k-token surcharge).

## Plan

Decided 2026-11-26 (maintainer, `/quest-plan`):

- Include routine `--advisor` pairing and bring back A/B arms across all T-shirt
  sizes? ✅ Yes, alongside [Stuck-agent advisor](/quest/m0/advise.md) (rejected:
  stuck-agent escalation only).
- Which sizes and exact arms? ✅ Replace/set all five sizes now (rejected: keep
  existing XS/S arms until 2026-12-01; skip Fable on L/XL; test Haiku on XS;
  `opus(high)+fable` on XL; wait for T3 Code `advisorModel` support):
  - `XS`: `A: sonnet(high)` vs `B: sonnet(high) + advisor opus`
  - `S`: `A: opus(medium)` vs `B: sonnet(high) + advisor opus`
  - `M`: `A: opus(high)` vs `B: sonnet(high) + advisor opus`
  - `L`: `A: opus(high)` vs `B: opus(high) + advisor fable`
  - `XL`: `A: opus(xhigh)` vs `B: opus(xhigh) + advisor fable`

The maintainer authorized the edits this needs in `assets/` (`assets/AGENTS.md`,
`assets/skills/run.md`, `assets/skills/iterate.md`) and `README.md`.

Recommended, for the implementer to confirm:

- **Model tables and CLI (`src/cli/models.ts`, `src/cli/agent.ts`, `src/cli/main.ts`):**
  - Add optional `advisor?: string` to `Model` in `src/cli/models.ts` and update
    `ARMS` to the five pairs above. Include `advisor` in `quest models` and
    `quest unblocked --json` output.
  - Add `--advisor <model>` to `quest agent start` and `quest agent resume` in
    `src/cli/agent.ts` (`claudeFlags` appends `--advisor <model>` when set;
    refuse `--advisor` on non-Claude harnesses).
  - Verify live through the maintainer's Claude subscription gateway (`cliproxy`)
    that `claude -p --model claude-sonnet-5-5 --effort high --advisor opus`
    forwards `anthropic-beta: advisor-tool-2026-03-01` and streams
    `advisor_tool_result` cleanly; if the gateway strips or rejects the header,
    file the follow-up in `kixel-ai/dotfiles` before enabling the arms live.
- **Records, usage, and cost attribution (`src/cli/models-record.ts`, `src/cli/usage.ts`, `src/cli/records.ts`):**
  - Record the advisor model in `Implementer:` lines (or routing metadata once
    [Telemetry sessions](/quest/m0/telemetry/sessions.md) lands) so iterates on
    an advisor-armed PR stay on the same executor + advisor pair and `quest usage`
    arms rollups separate `arm A` vs `arm B` cleanly.
  - Verify `src/cli/usage.ts` (and `token-max`) counts advisor model tokens and
    cost from Claude Code transcripts (`advisor_message` iterations /
    `advisor_tool_result` usage blocks) under the advisor model's pricing so
    advisor spend is never undercounted in arm comparisons.
- **Dispatch (`assets/AGENTS.md`, `assets/skills/run.md`, `assets/skills/iterate.md`):**
  - When a quest's or iterate's routed `Model` specifies `advisor`, dispatch it
    through `quest agent` (passing `--advisor <model>`) rather than a native
    harness subagent or T3 `delegate_task` until T3 Code exposes `advisorModel`.
- **Readout ([Routing evidence](/quest/m0/routing-evidence/README.md)):**
  - Update the readout table and schedule in `routing-evidence/README.md` to
    track the five advisor arms on first-round findings, review rounds,
    hand-backs, `## Caused by` escapes, and mean/median spend per merged PR.

Tests: unit tests for `ARMS` and `questWriters` across `XS`–`XL`, `quest agent`
passing `--advisor` to Claude and refusing it on Codex, `Implementer:` parsing
with an advisor note, and `quest usage` attributing advisor-iteration token
usage and cost to the session's PR and arm.

## Related

- [Stuck-agent advisor](/quest/m0/advise.md) - on-demand cross-vendor advisor
  for stuck agents
- [Routing evidence](/quest/m0/routing-evidence/README.md) - owns the writer A/B
  readout
- [Telemetry sessions](/quest/m0/telemetry/sessions.md) - moves routing metadata
  from `Implementer:` lines into posted session records
- [Model check](/quest/m1/model-check.md) - milestone model audit
