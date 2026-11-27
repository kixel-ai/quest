# [XS] main stops repeating the queue's check

## Goal

A push to `main` no longer reruns `just check`, `just test` and `nix flake check`, which
the merge queue's `queue-build.yml` already ran on that exact tree. `check.yml` keeps only
its `lifecycle` matrix, which tests something the queue does not: the installed CLI on
Linux and macOS.

## Plan

Found 2026-11-27 (host CPU audit, kixel-ai/dotfiles#403): every one of the 70 commits in
the audited window ran the `check` job after the queue had passed the same tree, and it
failed 22 of 72 times, so it added noise rather than signal.

Decided 2026-11-27 (maintainer, `/quest-plan`): ✅ plan it (rejected: dropping it). CI
builds and tests each tree once; asynchronous work on GitHub's runners covers only what
the queue does not.

- Before deleting the job, read its failures since the window started. If any caught a
  real break the queue missed, such as one only a hosted runner's environment shows, move
  that check into the queue or the lifecycle job instead of losing it. Otherwise say in
  the PR that none did.
- Update `check.yml`'s header comment, which describes the repeat.

## Related

- [Thin shared workflows](/quest/m0/ci/workflows.md) - the same day's decision that CI
  runs no checks on pull requests
