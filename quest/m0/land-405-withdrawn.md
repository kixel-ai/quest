# [S] Stop merge retries when a PR is withdrawn from the queue

## Goal

Whenever `quest land`'s `mergePinned` retries `PUT /pulls/:number/merge` after
a backoff (for a stale head propagation 409/405, stale mergeability, base
change, or post-push 405), it re-checks that the PR's auto-merge pick is still
active (with the same `enabledAt`) immediately before retrying, taking the
existing `Left the queue` path if a maintainer withdrew the PR during the
backoff.

## Plan

Found 2026-11-27 by replaying `gpt-6.2-sol` (`xhigh`) on
[kixel-ai/quest#929](https://github.com/kixel-ai/quest/pull/929) (which had
passed Sol `medium`) and verified on `main` at `src/cli/land-head.ts:385-410`.

- Caused by: [kixel-ai/quest#929](https://github.com/kixel-ai/quest/pull/929)
  (list under `## Caused by` in the fixing PR).
- `src/cli/land-head.ts:385-410` has three retry branches (`attempt < SETTLE_RETRIES`
  at lines 385, 398, and 407) that pause (`500 * 2 ** attempt` ms) and retry
  `PUT /pulls/:number/merge` with only the pinned commit SHA. If a maintainer
  disables auto-merge during any of those backoffs (even while GitHub still
  reports the old head or stale mergeability), the commit SHA is unchanged, so
  the retry can still merge a withdrawn PR.
- Re-read the PR's auto-merge state immediately before every merge retry in
  `mergePinned` (via a queue-active check callback or re-reading `auto_merge`),
  and return the existing withdrawal path whenever auto-merge was cleared or
  its `enabledAt` changed, regardless of which refusal triggered the backoff.

Tests: unit tests in `test/` simulating auto-merge withdrawal during backoff
across the head-propagation, stale-mergeability, and post-push 405 retry
branches, verifying `mergePinned` aborts without calling merge again.
