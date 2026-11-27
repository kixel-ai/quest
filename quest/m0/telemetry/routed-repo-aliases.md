# [S] Apply repository aliases in sender sub-agent routing

## Goal

When a parent session is queued from a checkout using a transferred
repository's current name, `quest send`'s `routed()` helper includes child
sub-agent sessions whose recorded `repositories` still hold the repository's
former name instead of silently dropping them from the upload.

## Plan

Found 2026-11-27 by replaying `gpt-6.2-sol` (`medium`) on
[kixel-ai/quest#899](https://github.com/kixel-ai/quest/pull/899) (unreviewed
under `low`), and verified still present on `main` after
[kixel-ai/quest#908](https://github.com/kixel-ai/quest/pull/908) landed.

- Caused by: [kixel-ai/quest#908](https://github.com/kixel-ai/quest/pull/908)
  (list under `## Caused by` in the fixing PR).
- In `src/cli/send.ts:477-504`, `repositories` is built as
  `new Set([here, key(repository)])`, and `routed()` checks
  `s.repositories.some((r) => repositories.has(r))` (line 488) and
  `s.repositories.every((r) => repositories.has(r))` (line 502) against raw
  names without resolving each `r` through `current(key(r))` / the alias map.
  When the parent checkout already uses the new name, `here === key(repository)`,
  so any child session whose `s.repositories` only names the former repository
  is excluded before shared attribution runs.
- Resolve `s.repositories` entries through the same `current()` / alias lookup
  used on line 497 so old-name child sessions match `here`.

Tests: add a sender unit test in `test/` where a parent session is queued from
a checkout using the repository's current name and its child sub-agent records
only the former name, verifying the child session is routed and uploaded under
the current name.
