# [M] The gate starts cheap commands at once

## Goal

`quest gate` starts a command at once, without queueing, when its own
recent runs of the same command in the same checkout's repository show it
uses little CPU, so a cheap command an agent gated anyway costs no wait.
Heavy commands queue as they do now.

## Plan

From the 2026-11-18 [mistake audit](/quest/m0/mistake-audit.md) run, on
the gate records [moq-dev/quest#747](https://github.com/moq-dev/quest/pull/747)
added (2026-11-17 to 11-19, this host only): 887 of 3,048 gated runs (29%)
used under 5 CPU-seconds, together 0.16% of gated CPU, against 20% to 22%
before `quest context` said on 2026-11-15 to gate by CPU. They queued a
median 5 seconds, 163 of them over a minute, 46,000 agent-seconds in all.
Most were one class: `bun test` in moq-dev/moq, gated 347 times at a median
0.5 CPU-seconds, 272 of them under 5. The prose rule already covers it and
the class still recurs, so the fix moves up to the gate itself.

Recommended:

- Key the history by the record's `command` (program names and
  subcommands) and repository, read from the runs the gate already measures
  on this host. Judge by the class's typical run, such as its median over
  recent runs, so one cheap run of a usually heavy command, such as
  `just check` with a warm cache, does not exempt it.
- Derive the cutoff from what a queued slot protects: a command whose
  typical run keeps under one core busy for a few seconds cannot overload
  the host. State the chosen value and the data behind it in the PR.
- An exempt run is still measured and recorded, so a command that turns
  heavy queues again on its next runs.
- Unmeasured hosts, such as macOS or Linux without a systemd user scope,
  keep today's behavior.
- Leave `quest context`'s "gate by CPU" line as it is until the next audit
  shows whether misgated cheap runs still cost wait time.

## Related

- [Mistake audit](/quest/m0/mistake-audit.md) - counts gating mistakes each
  week
