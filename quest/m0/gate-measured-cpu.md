# [M] Admit on measured CPU, and agents on memory

## Goal

On Linux, `quest gate` admits a command while the host's measured CPU busyness, read from `/proc/stat` over the last few seconds, plus the commands admitted but not yet measured stays under the CPU count. I/O wait is not busyness, so a host whose load is inflated by disk-blocked tasks stops idling, while real CPU saturation still holds work back.
`quest agent admit` admits on memory alone, no longer waiting on load or on gated commands queued on the host.

Non-goals: macOS and other platforms, which keep the 1-minute load average; the memory budget; the running-commands floor, which stays at one per CPU.

## Plan

Decided 2026-11-27 (maintainer, /quest-run): ✅ admit gated commands on measured CPU on Linux and agents on memory only, one quest in m0 (rejected: gate only; drop it). This replaces [kixel-ai/quest#937](https://github.com/kixel-ai/quest/pull/937), closed at the same pick (rejected: merge its 2× load limit as is), which doubled the load limit and the running-commands floor.

Evidence, measured read-only on a 32-CPU Linux agent host on 2026-11-27 around 12:00Z:

- The 1-minute load was 27–31 against the limit of 32, while CPUs were about 27% busy (about 8.5 cores) and 12% in I/O wait. I/O pressure ("some") was about 21%. Load ran about 3.5× the real CPU demand.
- Lean compile bursts reached 90–110 runnable threads on 32 CPUs, with CPUs 83% user-busy: real oversubscription that a 2× load limit would add to.
- The running-commands floor sums gated commands' measured cgroup CPU peaks, not load; #937's 2× would have admitted gated work up to twice the host's CPU.
- Overnight, `quest agent admit` waited over 85 minutes at a time, cycling through load, gated commands queued on the host, and free memory, while gated commands used about 2–10 cores on average. With 9–19 GB available, memory decided once load allowed.

Recommended, for the implementer to confirm:

- Read busy CPU as the delta of `/proc/stat`'s aggregate `cpu` line between two samples (user, nice, system, irq, softirq, steal over total, leaving out idle and iowait), in the same CPU units `hostLimits` and `room` in `src/cli/gate.ts` already use, so no new threshold is needed. Keep the sample in gate's state, so an admission costs no sleep; a sample older than a few seconds is taken afresh. CPU pressure (`/proc/pressure/cpu`) was considered and needs a tuned threshold.
- Keep the 5-second spacing and the per-admission reservation, so a burst of admissions before the first measurement still counts.
- In `src/cli/admission.ts`, drop the load unit each pending agent reserves and the wait on queued gated commands; keep the 4 GiB memory reservation per pending agent.
- Tests mock `/proc/stat` and time: an I/O-bound host with load above the CPU count admits; a CPU-saturated host with load below it waits; agents admit with load and gate queue full when memory allows.
- Validate on a loaded Linux host: under a disk-heavy build, commands admit while CPUs idle; under a compile burst, they wait.
