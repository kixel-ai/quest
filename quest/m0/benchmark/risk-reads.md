# [S] One PR body cannot break risk reads

## Goal

A malformed `## Review` risk record in one PR body leaves only that PR's risk marked malformed: `pullRequestStatus` no longer throws on it, so `quest status` and `quest merge` still refuse that PR loudly, but no reader of many PRs stalls on it.
`matches` treats a path containing a line break like any other, so no changed path escapes a `## High` or `## Automatic` rule.

Non-goals: dropping `Status.risk`, which this repository's status, review, and landing read; changing the record's format.

## Plan

Decided 2026-11-22 (maintainer, `/quest-plan`, following up [kixel-ai/kixel.quest#87](https://github.com/kixel-ai/kixel.quest/pull/87)): ✅ keep `Status.risk` and stop the throw (rejected: dropping `Status.risk`, as that PR first proposed, since [moq-dev/quest#802](https://github.com/moq-dev/quest/pull/802) made this repository's own landing read it; fixing only `matches`).

Both bugs came with [moq-dev/quest#716](https://github.com/moq-dev/quest/pull/716):

- `recordedRisk` in `src/core/risk.ts` throws on a malformed `- Risk:`, class, or override line, and `risk()` in `src/github/status.ts` calls it unguarded, so `pullRequestStatus` fails for the whole PR. Kixel Quest's index reads every open PR through it, so one body, which anyone who can open a PR writes, fails its repository's read on every retry (reproduced in kixel-ai/kixel.quest#87 against a fake GitHub). Recommended: carry the error as a malformed state in `Status.risk` that `quest status` prints and `quest merge` refuses, rather than a thrown error. A line that misses its pattern must be malformed too, not absent: `- Risk:dire` now fails `^- Risk: ` and reads as no record, so test for the line the way the class and override checks do (`^- Risk:`), then parse it.
- `matches` builds its regex from `.`, which skips a line break, so a path under a `**` or a matched directory that contains one does not match. Recommended: the `s` flag. Kixel Quest's copy in `src/risk.ts` already has the fix.

Tests: a body with a malformed risk line, including `- Risk:dire` without the space, yields that PR's status with its risk marked malformed and a refusal from `quest merge`, while a second PR in the same read is unaffected; and `matches` matches a path containing a line break under `**` and under a directory pattern.

kixel-ai/kixel.quest's `quest/m0/status-risk.md` waits on this and bumps its `quest` pin once it lands.
