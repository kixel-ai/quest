# [S] A PR's own build never records its review or lands it

## Goal

When `quest review` runs from the source of the checkout it judges, the round
still runs but writes no `## Review` record and no `quest review` commit status,
and it says to rerun with an installed `quest` for the record that counts.
`quest merge` run that way refuses. A PR can then exercise its own review
changes on the real surface without marking itself reviewed.

## Plan

Found 2026-11-25 by the `/quest-run` coordinator: reviewing
[kixel-ai/quest#869](https://github.com/kixel-ai/quest/pull/869) in its own
checkout ran `bun run --silent quest`, the PR's build. That build predated
[kixel-ai/quest#868](https://github.com/kixel-ai/quest/pull/868), so the review
record had no status. No single PR caused it: this repository's AGENTS.md
told agents `quest` means the checkout's build, and nothing stopped a PR's code
from judging that PR. The planning PR that added this quest also amended
AGENTS.md to run review and merge with an installed `quest` from outside the
PR's checkout, since the dev shell's build is pinned by the PR's own
`flake.lock`. This check catches only a source run inside the checkout; a
build the PR's pin selects stays the AGENTS.md rule's.

Decided 2026-11-25 (maintainer, `/quest-plan`):

- ✅ Enforce it with a check, and add the AGENTS.md line (rejected: the
  AGENTS.md line only, which nothing enforces; drop it). A rule with no
  exceptions belongs in a check.
- ✅ The review round runs but never records, and `quest merge` refuses
  (rejected: both refuse outright, which would leave a PR that changes
  `quest review` no way to validate it on its real surface). PRs such as
  [kixel-ai/quest#885](https://github.com/kixel-ai/quest/pull/885) change
  review itself.

Recommended: compare the running entry point's real path with the judged
checkout's Git top level (`--root`, or the working directory). An installed
bundle or binary lives outside every checkout, so only a source run inside it
matches. Decide this once at startup, not per write.

Tests: a review run from inside the judged checkout writes neither the record
nor the status and prints the rerun hint, a run from outside records as today,
and `quest merge` from inside refuses before any write.

## Related

- [A high head lands only with a review status for its diff](/quest/m0/high-review-status.md) - the landing check that reads the status this keeps honest
