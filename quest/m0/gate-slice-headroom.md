# [S] Gate admits only what its slice has room for

## Goal

On Linux, `quest gate` admits a command only when the cgroup its scope will run in, the user manager's `background.slice`, has headroom under that slice's `memory.high` and `memory.max`, as well as when the host and the caller's own cgroups do. A slice already at its cap queues the next command instead of starting it into reclaim.

Non-goal: setting the cap, which each host's configuration owns.

## Plan

Found 2026-11-24 in [kixel-ai/dotfiles#292](https://github.com/kixel-ai/dotfiles/pull/292), which set `MemoryHigh=50%` on `background.slice` so every gated scope together gets half of RAM, after systemd-oomd killed gate scopes on fedora five times on 2026-11-23. Kept by the maintainer at that PR's merge pick.

`linuxMemory()` in `src/cli/gate.ts` walks the cgroups in `/proc/self/cgroup`, so it counts the caller's session, not `background.slice` (`gate.ts` launches scopes there, around line 728). With the cap, a slice at its limit still looks roomy whenever the host has free memory.

- Recommended: also walk the target slice's cgroup (under `user@<uid>.service`) with the same limit and usage reading, inactive file cache excluded, and take the smaller headroom.
- A host without the slice or the cap behaves as today.

Tests: with fixture cgroup trees, a slice whose `memory.current` minus inactive file sits at its `memory.high` refuses admission while the host has room, and a slice with no limit leaves today's answer unchanged.

## Hosts

- linux - cgroup v2 and the systemd user manager
