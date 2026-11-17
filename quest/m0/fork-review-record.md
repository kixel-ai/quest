# [S] quest review records on a contributor's fork PR

## Goal

`quest review` in a maintainer's checkout of a contributor's fork PR finds
that PR, reads its `## Models` size, and writes its `## Review` record, so
nobody writes one by hand. Contributors reviewing in their own fork's clone
keep working as today.

## Plan

Decided 2026-11-17 (maintainer, `/quest-plan` after `/quest-run`): ✅ m0
(rejected: m1), since every fork PR's local review now needs a hand-written
record that `/quest-merge` then trusts; ✅ fix the lookup (rejected: a
`--pr <url>` flag; dropping it).

- Cause: `openPull` in `src/cli/review-record.ts` matches only an open PR
  whose head repository is the one the base's remote pushes to. In a
  maintainer's checkout that is the upstream, not the contributor's fork, so
  it prints `record skipped: no open PR from ...`, and `pullModels` returns
  null, so the round runs at the default size. Both iterates on
  [#761](https://github.com/moq-dev/quest/pull/761) hit this: they reviewed
  at size M instead of the body's S and wrote the record by hand.
- Those iterates worked in a detached checkout with `--branch` and pushed to
  the fork by URL, so the checkout has no push remote naming the fork, and
  the reviewed head is not pushed yet when the round ends.
- Recommended: match the open PR into the base whose head branch is the
  reviewed branch, from any head repository; prefer the push repository's
  when several match, and skip naming every candidate when the choice is
  still ambiguous.
- Test: a stub forge with an open PR from `contributor/quest:<branch>`
  into the upstream gets its record rewritten and its size read from a
  maintainer's checkout whose remote is the upstream.
