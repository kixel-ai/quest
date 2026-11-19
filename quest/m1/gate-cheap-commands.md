# [M] The gate starts cheap commands at once

## Goal

`quest gate` starts a command without waiting on the load average when its
own recent runs of the same invocation in the same repository show it uses
little CPU, so a cheap command an agent gated anyway costs no wait. It
still waits for free memory, and heavy commands queue as they do now.

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

Decided 2026-11-19 (maintainer, merge pick of
[moq-dev/quest#786](https://github.com/moq-dev/quest/pull/786)):

- Keep it? ✅ Keep, in m1 (rejected: m0, drop)

Recommended:

- Key the history by the full invocation the gate is handed (its argv)
  and the repository, so `bun test <file>` and a whole-suite `bun test`
  stay apart. Store only a hash of the argv in a local file the gate
  owns, never the arguments, which can hold secrets; the shared record's
  `command` keeps program names and subcommands alone, too coarse for this.
- Judge by the invocation's typical run, such as its median over recent
  runs, so one cheap run of a usually heavy command, such as `just check`
  with a warm cache, does not exempt it.
- Derive the cutoff from what a queued slot protects: a command whose
  typical run keeps under one core busy for a few seconds cannot overload
  the host. State the chosen value and the data behind it in the PR.
- An exempt start skips only the load wait. It still waits for free
  memory, since CPU history says nothing of memory, and still enters the
  ledger like any admission, charged at its recorded typical cores before
  it is sampled. A burst of exempt starts is then bounded: once their
  charged cores and the running commands' fill the host's CPUs, the next
  one waits as today.
- An exempt run is still measured and recorded. An invocation queues again
  once heavy runs are the majority of its recent window, as a median
  implies, so a command that turned heavy is exempt for a few runs at most.
- Unmeasured hosts, such as macOS or Linux without a systemd user scope,
  keep today's behavior.
- Leave `quest context`'s "gate by CPU" line as it is until the next audit
  shows whether misgated cheap runs still cost wait time.

## Related

- [Mistake audit](/quest/m0/mistake-audit.md) - counts gating mistakes each
  week
