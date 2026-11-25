# [M] Gate counts each running command at its peak memory

## Goal

On Linux, where the gate runs each command in its own systemd scope, `quest gate` counts every running admitted command at the most memory it has held, as it already counts its CPU at the most cores it kept busy (`measure`, `Admission.cores` in `src/cli/gate.ts`). A heavy check then queues while a running build is in a memory lull, instead of being admitted and pushing the host into reclaim once the build grows back.

A command is counted once: at the larger of its peak and what the host's available memory already reflects of it. A command not yet measured keeps today's constant share, as does every command on a host without scopes.

## Plan

Today each admission from the last `RECENT_MS` reserves `limits.memory`, `min(COMMAND_MEMORY, memory / 4)` (`hostLimits`), from available memory, and a running command counts after that only through the host's current available memory (`standing`, `room`, and `admit`'s `turn`). A build that drops to a few GiB between phases looks like room.

Decided 2026-11-24 (maintainer, /quest-plan):

- ✅ Count a running command at its live peak (rejected: also remember each command's past peak across runs to size it before it starts; a command has no stable key to look it up by).
- A command not yet started keeps the constant.
- Where no scope exists, behavior stays as today, as for CPU: Linux without a systemd user manager (process groups) and Windows keep the constant; macOS gates no memory at all (`fileHost().memory` is `Infinity` there).
- Tests use the fake `Host` in `test/gate.test.ts`, with no real clock.

Arithmetic, recommended: available memory already holds each running command's current working set, so subtract only what its peak adds on top of that, `max(0, peak - current)`, summed over running admissions. A recent admission keeps its constant reservation until measured, then reserves `max(0, max(peak, limits.memory) - current)` while still recent, rather than both the constant and its peak. The load side of `taken` (`load + taken`) stays as it is. `room` and `turn` duplicate this check, so change both, or factor it into `standing`.

Reading the current working set live, rather than from a ledger value up to `SETTLE_MS` old, keeps a command that just shrank from being under-counted. Recommended: record the scope beside the peak in the admission, and give `Host` a per-scope reading beside `usage`, cached as `fileHost` caches `scopeGroup`. `measure` then publishes a new peak only as it grows, which is rare once a command warms up.

The ledger gains fields, so bump `LEDGER_VERSION` and validate them in `parse`.

Tests: a running command measured above its current use queues a check that raw available memory would admit; a command at its peak adds nothing beyond what available memory shows; an unmeasured recent admission still reserves the constant; and `measure` publishes the peak only as it grows. Validate on a Linux host with two gated commands, reading the ledger under `~/.cache/quest/admissions-v*/`.

Context: the closed [kixel-ai/quest#693](https://github.com/kixel-ai/quest/pull/693) (quest `quest/m0/gate-memory.md`, deleted in [kixel-ai/quest#692](https://github.com/kixel-ai/quest/pull/692)) tried per-scope memory ceilings and was dropped after the 2026-11-13 complexity audit; its quest had listed "size a command's share from its measured peak, rather than a constant" as an unbuilt choice. This quest sets no ceiling; it changes admission only.

## Waiting

- Maintainer: what "peak" reads. The decision named the scope cgroup's `memory.peak`, but that counts page cache: in a scope under `background.slice` on kernel 7.0, writing then reading a 1 GiB file left `memory.peak` at 1027 MiB with 1 MiB anonymous and 1024 MiB `inactive_file`, cache that `linuxMemory` already treats as free. A build writing its artifacts would be counted at their size and queue work needlessly; `memory.peak` is also missing before Linux 5.19, while scopes need only 5.14.
  - Recommended: `measure` samples the scope's working set, `memory.current` less `inactive_file` as `linuxMemory` reads it, every `SETTLE_MS` and keeps the largest over the run. It misses spikes shorter than one sample.
  - Read `memory.peak` as decided, accepting that cache counts.

## Hosts

- linux - systemd scopes and cgroup v2 memory files

## Related

- [Gate admits only what its slice has room for](/quest/m0/gate-slice-headroom.md) - also changes the available memory this quest subtracts each command's reservation from
