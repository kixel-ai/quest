# [S] Every PR check is required

## Goal

Every check that runs on a moq-dev/quest pull request is one `main`'s ruleset requires. Each job that should not gate a PR moves to the merge queue, the nightly run, or the release run instead. A PR then has no optional checks, so `quest wait`, which wakes once every check has finished, waits only on what gates landing, and no agent stalls on a slow check that decides nothing.

Non-goal: other repositories, which kixel-ai/dotfiles' `repo-settings check` covers.

## Plan

Decided 2026-11-22 (maintainer, while settling [moq-dev/quest#810](https://github.com/moq-dev/quest/pull/810)'s wait rule): "we MUST NOT HAVE OPTIONAL CHECKS. Every PR check MUST BE REQUIRED or moved to an async run (ex. nightly)". On that basis #810 keeps `quest wait` waking on every check (rejected: a wake on required checks only), since the two are the same once no optional checks exist.

At a88c65b, the ruleset requires only `Queue`. On a PR, `check.yml` runs `check` and `lifecycle`, `release.yml` runs `plan`, `build`, and the four-target `check` matrix among others, and `gate-macos.yml` runs on gate paths. All of them are optional.

Recommended:

- The ruleset comes from kixel-ai/dotfiles' `bin/repo-settings`, so prefer keeping `Queue` as the only required context: move each PR job into the merge queue's build or onto `release.yml`'s nightly schedule, by the rule in `quest context` that the merge gate holds only fast, high-signal checks. Requiring a new context means changing the standard there, not in this repository.
- A workflow filtered by `paths` never reports when its paths are untouched, so it cannot be required as is: move `gate-macos.yml` to the nightly run, or into the queue with a job-level condition that reports success.
- Each run moved off pull requests, and the nightly `windows.yml` already there, files what it finds as work, as `quest context` asks: today a failed scheduled run only emails the account that last edited its cron.
- Say in the PR how much the queue's run time changes, and which checks a PR author loses before the queue.
