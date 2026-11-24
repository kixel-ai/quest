# [XS] quest records install restarts a running sender on macOS

## Goal

`quest records install` succeeds on macOS while the records sender is
running. Today `installSender` in `src/cli/service.ts` runs
`launchctl bootout gui/<uid>/dev.moq.quest.records` and then `bootstrap`
right away, but `bootout` returns before the running job is gone, so
`bootstrap` fails with `Bootstrap failed: 5: Input/output error`. It failed
both times on kixtop on 2026-11-24 during
[kixel-ai/dotfiles#262](https://github.com/kixel-ai/dotfiles/pull/262), whose
`./install` runs the step, and a second `bootstrap` a moment later worked.

## Plan

- After `bootout`, wait until `launchctl print gui/<uid>/dev.moq.quest.records`
  fails, which means launchd has dropped the job, then `bootstrap`. Bound
  the wait by the job's exit timeout: launchd sends SIGKILL once
  `ExitTimeOut` (20 seconds by default) passes, so a job still listed after
  that is an error to report, not to retry. `uninstallSender` needs no wait,
  since nothing follows its `bootout`.
- Take the wait's clock and sleep from `ServiceDependencies`, so the test in
  `test/service.test.ts` drives a job that is listed for two polls and then
  gone, and one that never goes, without sleeping.
- Rejected: `launchctl kickstart -k`, which restarts the job in place but
  keeps the old plist, so a reinstall after an upgrade would keep running
  the old `quest` path. Rejected: retrying `bootstrap` on error 5, which
  hides any other cause of that error.
- Check it on a Mac with the sender running: `quest records install` twice
  in a row exits 0, and `launchctl print gui/$(id -u)/dev.moq.quest.records`
  shows the new process.

## Hosts

- macos - only launchd's asynchronous bootout reproduces it
