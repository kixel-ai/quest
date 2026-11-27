# [S] Stop post-push 405 retries when a PR is withdrawn from the queue

## Goal

When `quest land`'s `mergePinned` retries a post-push HTTP 405 after backoff,
it re-checks whether the PR's auto-merge pick is still active (with the same
`enabledAt`) before attempting the merge again, taking the existing `Left the
queue` path if a maintainer withdrew the PR during the backoff.

## Plan

Found 2026-11-27 by replaying `gpt-6.2-sol` (`xhigh`) on
[kixel-ai/quest#929](https://github.com/kixel-ai/quest/pull/929) (which had
passed Sol `medium`) and verified on `main` at `src/cli/land-head.ts:407-410`.

- Caused by: [kixel-ai/quest#929](https://github.com/kixel-ai/quest/pull/929)
  (list under `## Caused by` in the fixing PR).
- `src/cli/land-head.ts:407-410` pauses (`500 * 2 ** attempt` ms) and retries
  `PUT /pulls/:number/merge` with only the pinned commit SHA. If a maintainer
  disables auto-merge while `mergePinned` is in that 405 backoff, the commit
  SHA has not changed, so the retry can still merge a withdrawn PR.
- Re-read the PR's auto-merge state after the backoff (or pass a queue-active
  check callback into `mergePinned`) and return the existing withdrawal path if
  auto-merge was cleared or its `enabledAt` changed.

Tests: unit test in `test/` simulating a 405 refusal followed by auto-merge
being disabled during the backoff, verifying `mergePinned` aborts without
calling merge again.
