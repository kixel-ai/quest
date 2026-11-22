# [S] The gate fails when systemd never starts its scope

## Goal

When the systemd user manager leaves a gated command's scope start job queued
for 60 seconds, `quest gate` (and every other `systemdScopes` run) fails with
an error that names the scope and says the user manager did not start it,
pointing at `systemctl --user list-jobs`. Today it waits silently forever. A
manager that is healthy, even one busy reloading, starts a scope in well under
that, so runs on a working host never see the error.

Non-goals: fixing or restarting the user manager, and retrying the run.

## Plan

- Found on fedora on 2026-11-22: uresourced's per-user daemon livelocked the
  user manager ([kixel-ai/dotfiles#246](https://github.com/kixel-ai/dotfiles/pull/246)
  masks it), so its 50 queued start jobs, every `quest-gate-*.scope` included,
  sat for hours while the gated commands printed nothing. Agents blamed the
  load and stopped other work before anyone looked at the manager. No single
  Quest PR caused it: the gate has waited on the start job since it moved into
  systemd scopes.
- Decided 2026-11-22 (user, /quest-plan): fail the run rather than report and
  keep waiting.
  - ✅ Fail the run (rejected: report on stderr and keep waiting, drop it)
- Decided 2026-11-22 (user, /quest-plan): the limit is 60 seconds.
  - ✅ 60 seconds (rejected: 10 seconds, 5 minutes)
- Recommended: let systemd enforce it with `--property=JobTimeoutSec=60` on the
  `systemd-run` in `scoped()` (`src/cli/supervise.ts`); systemd cancels a start
  job queued that long, and `systemd-run --user --scope` accepts the property
  (checked on systemd 262). `contain()`'s "exited before the command started"
  failure then needs to tell this case apart and say the manager never started
  the scope, rather than leave the agent to read `systemd-run`'s own message.
  Confirm which exit status or message `systemd-run` gives for a timed-out job
  before keying on it.
- Unit tests mock `systemd-run`'s outcome rather than waiting 60 seconds.

## Hosts

- linux - systemd user scopes
