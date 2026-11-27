# [S] Respect Linux build-slice memory and Windows admission in quest agent admit

## Goal

`quest agent admit` honors Linux's `background.slice` memory cap when admitting
agents (matching `quest gate`'s slice-aware memory reading) and preserves
non-Linux admission (`room`) on Windows rather than dropping it outside macOS.

## Plan

Found 2026-11-27 by replaying `gpt-6.2-sol` (`xhigh`) on
[kixel-ai/quest#946](https://github.com/kixel-ai/quest/pull/946) (which had
passed Sol `high`) and verified on `main` at `src/cli/admission.ts:102-104`.

- Caused by: [kixel-ai/quest#946](https://github.com/kixel-ai/quest/pull/946)
  (list under `## Caused by` in the fixing PR).
- In `src/cli/admission.ts:102-104`:
  1. `gate: fileHost(gate)` omits the UID that `quest gate` passes to read the
     capped `background.slice` cgroup memory limit, so Linux hosts with free
     system RAM but a full build slice can admit agents whose first builds
     immediately stall on slice memory.
  2. `load: process.platform === "darwin"` switches Windows onto the
     memory-only path, dropping `room`'s CPU-count bound against pending agents
     and queued commands. Use `load: process.platform !== "linux"` (keeping
     memory-only admission on Linux and `room` on macOS and Windows).

Tests: unit tests in `test/` covering Linux slice-capped memory admission (via
the gate's UID/slice reading) and Windows using `room` rather than memory-only
admission.
