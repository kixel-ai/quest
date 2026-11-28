# [S] The land fixer tests leave no fixer running

## Goal

`just test` leaves no land fixer, fixer wrapper, or fake agent process
running after it finishes, pass, fail, or aborted, on Linux and macOS, and
the suite fails if one outlives its test.

## Plan

Found 2026-11-27 on the maintainer's macOS host: a `quest land fix --agent
/tmp/nix-shell.*/quest-test-*/agent --agent-arg=- .../fixer-input-1-*.log 1`
and its `/bin/sh .../agent -` child had sat idle for 2 days, reparented to
launchd under the `quest-fixer` wrapper shell. The argument list matches
`test/land.test.ts`'s fixer fixture, whose `blocked` agent waits on a fifo
(`read -r release < fifo`). `src/cli/land-fixer.ts` spawns the wrapper
`detached`, in its own process group, so the test runner's exit does not
reach it, and a test that fails or is aborted before releasing the fifo
leaves it waiting forever. It was stopped by hand, so reproduce the leak
before fixing it, per the rule.

[kixel-ai/quest#690](https://github.com/kixel-ai/quest/pull/690) fixed the
same class of leak for the gate's scopes, stopping what a test started when
it fails or its run is signalled. Do the same for the fixer suites in
`test/land.test.ts` and `test/land-watch.test.ts`:

- Each test's teardown kills the process group of every fixer job it
  started, and asserts none was still running when it was not expected to
  be.
- A cancelled run (SIGINT or SIGTERM to `just test`) may never reach
  per-test teardown, so the test process also stops every fixer group it
  started when it is signalled, on Linux and macOS alike. #690's gate
  handler is Linux-only.
- On macOS, `identity()` in `src/cli/land-fixer.ts` reads `/proc` and
  returns nothing, so the production timeout never signals the fixer, and
  `timesOut` can pass with the fake agent still blocked on its fifo. Keep
  the process-identity expectations in Linux-only cases, and have teardown
  stop the fixer after deadline tests on both platforms, so the new
  assertion does not fail on macOS for this reason.

A host-side backstop for leaks the harness cannot catch, such as a runner
killed with SIGKILL, is planned in kixel-ai/dotfiles'
`quest/m0/test-leak-watch.md`.

Decided 2026-11-27 (maintainer, /quest-plan): ✅ plan it in m0 beside a
host-side backstop in kixel-ai/dotfiles (rejected: harness fix only; drop).

## Hosts

- linux
- macos - where the leak was found
