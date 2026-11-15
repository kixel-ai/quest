# [XS] The gate record carries each run's CPU and end time

## Goal

Each `QUEST_GATE_RECORD` line also carries the run's CPU and when it
ended, so a reader such as Kixel Quest's job page
([kixel-ai/kixel.quest](https://github.com/kixel-ai/kixel.quest)'s
`quest/m1/jobs.md`) gets a gated command's wait, CPU, and wall time from
the record alone, without joining its `unit` to the systemd journal.

Non-goals: CPU where the gate owns the command only as a process group,
such as on macOS, which stays null as in the wait log; peak memory, which
stays in the journal; and Windows, which still refuses the variable.

## Plan

Decided 2026-11-15 (maintainer, `/quest-complete` of
[kixel-ai/kixel.quest#56](https://github.com/kixel-ai/kixel.quest/pull/56),
then `/quest-plan`): ✅ Linux, reusing the measurement
[gating](/quest/m0/benchmark/gating.md) adds (rejected: also a
reaped-children lower bound on process-group gates, which means rewriting
the group owner for a macOS host that has not arrived; no quest, with the
job page reading the `gated` list from uploaded session records, which
arrive only after a session sends them).

This reverses part of the 2026-11-13 decision in
[moq-dev/quest#685](https://github.com/moq-dev/quest/pull/685), which
kept in-gate CPU measurement out of the record for its ~470 lines. Gating
measures each outermost run's CPU from its scope's `cpu.stat` for the wait
log anyway, so the record takes the same values rather than measuring
again.

Agent's choices, for the implementer to revisit:

- Add `ended` (ISO timestamp, null for a run cancelled before admission)
  and `cpu` in milliseconds (null where the wait log's is), matching the
  wait log's names and units so both read the same.
- Keep `unit`, which still names the scope's journal line for peak memory.
- Update the README's "Record each run" section to say where CPU and wall
  time come from.

## Required

- [Gating](/quest/m0/benchmark/gating.md) - measures each gated run's CPU
  and end time, which this copies into the record
