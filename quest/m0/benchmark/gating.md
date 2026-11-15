# [L] Records show what each session gated, and what it should have

## Goal

Each session's record lists the commands it ran through `quest gate`, each
with its wait, CPU, and wall time, and the CPU each of its other shell
calls used. An audit can then see both kinds of gating mistake: a gated
command that barely used the CPU, such as `quest gate quest review`, and a
CPU-heavy command run outside the gate. `quest usage --json` prints them,
the records Kixel Code stores carry them, and the
[mistake audit](/quest/m0/mistake-audit.md) reads them in each weekly run,
its Plan updated to say so.

Non-goals: refusing any command at the gate or in a hook; changing how the
gate admits; per-process host monitoring, which Kixel Code's host report
owns.

## Plan

Decided 2026-11-15 (maintainer, `/quest-plan`), from an audit of 14 days
of Claude and Codex transcripts on the maintainer's three Linux hosts,
joined to the gate's wait log and each gate scope's CPU accounting in the
systemd journal:

- Gate by CPU, not run time? ✅ Yes: `quest context`, `quest gate --help`,
  and the README now say commands that may use significant CPU go through
  the gate, and `quest review`, servers, and formatters stay out
  (rejected: a two-sentence wording explaining each exception). The chosen
  sentence lost "browsers" and "which queues until the host has room" to
  fit the 10,000 characters a hook's context may hold.
- How are gating mistakes caught? ✅ Measured here and audited weekly
  (maintainer: "Instead of making quest gate impossible with quest review,
  add this to the metrics we're planning"). Rejected: a `quest hook` rule
  denying `quest gate quest review` before it queues.
- How is an ungated command's CPU found? ✅ Quest's `PreToolUse` and
  `PostToolUse` hooks read the session's cgroup CPU counter around each
  shell call and record the difference. Rejected: matching ungated
  commands by name against gated runs of the same command, which misses
  commands never gated and cannot tell a heavy run from a light one; both
  together, until the audit shows the fallback is needed.

Agent's choices, for the implementer to revisit:

- Gated side: the gate already logs each outermost run's queue and run
  times per session under `$XDG_STATE_HOME/quest/waits`. Add the command
  and its CPU, read from its scope's `cpu.stat` as `measure` does, or the
  reaped children's CPU where it owns only a process group, to that line.
  `QUEST_GATE_RECORD` stays the file a reader such as Kixel Code's job
  runner owns.
- Ungated side: under T3 Code on Linux each agent session runs in a
  systemd scope of its own, and gate scopes run outside it, so its
  `cpu.stat` counts the harness plus every ungated command. Count only a
  cgroup that holds the session alone: a terminal's shared scope would
  charge the user's other work to it, so record null there, as on macOS.
- Calls that overlap, in parallel or in the background, are reported as
  one group with their summed CPU. Sub-agents share their parent's scope,
  so match calls by tool-use ID.
- Codex registers only a `PreToolUse` hook today; use its post-call event
  if its hooks offer one, and record null otherwise.
- Report ranked lists, gated commands by least CPU and ungated calls by
  most, with no threshold: the mistake audit judges what is a class.

Baseline, 2026-11-01 to 11-15:

- 32.8k gated calls on three hosts. `quest gate quest review`: 591, all
  from Claude, at 2.2 CPU-seconds and 0.03 cores over a 58-second median
  run. It peaked at 126 on 11-12, before
  [moq-dev/quest#673](https://github.com/moq-dev/quest/pull/673) put model
  calls outside the gate, and fell to 5 on 11-15; 27 of the 29 fedora
  sessions that gated a review after 11-14 had loaded the older rule.
- 20% to 22% of 17.6k gate scopes over 3 days used under 5 CPU-seconds,
  together 0.2% of gated CPU. Most were usually heavy commands that were
  cheap that time, such as one `cargo test`; always-cheap tools, such as
  one vitest file, `bun x`, or `cargo fmt`, were about 1% to 2% of calls.
- `nix build` shows about 1 CPU-second inside its scope, since
  `nix-daemon` builds outside it; count it apart rather than as a cheap
  command.
- Ungated CPU: not measured, the gap this quest fills.

## Related

- [Mistake audit](/quest/m0/mistake-audit.md) - reads these records as a
  class each week
- [Remove the gate's quick flag](/quest/m0/gate-quick.md) - the same rule
  change leaves the flag no use
