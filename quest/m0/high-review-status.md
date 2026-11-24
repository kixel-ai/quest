# [M] A high head lands only with a review status for its diff

## Goal

A head `RISK.md` rates high lands only with a passing `quest review`
commit status that covers its exact diff, from the head's merge base with
the base. Any push after the last review, by a person or a helper such as
the land fixer, the quest merge driver, a flaky disable, or a pin bump,
leaves a high head waiting for a new review.

## Plan

Decided 2026-11-24 (maintainer, on
[kixel-ai/quest#863](https://github.com/kixel-ai/quest/pull/863#issuecomment-7146992032)):
✅ check once, at landing, instead of gating each helper by path
(rejected: extending #863's per-helper checks; holding #863 for this).
#863's own gates, the fixer's protected set and the standing pick's high
exclusion, stay until this lands.

Recommended: enforce it in quest's landing paths, `quest merge --land`
(`src/cli/hold.ts`) and the watcher's requeue after a fix
(`src/cli/land-watch-fix.ts`), reading the status
[kixel-ai/quest#868](https://github.com/kixel-ai/quest/pull/868) writes
through its trust check (`src/github/review-trust.ts`), so a forged or
stale status counts for nothing. Then delete the per-helper high rules it
subsumes, such as the fixer's every-path protection on a high PR, which
otherwise hands back fixes the check would hold anyway.

#868's follow-up makes `quest review` a required status check in
kixel-ai/dotfiles' `bin/repo-settings`. Read that ruleset first: if it
requires the status on every head, GitHub already holds a high head with
none on its exact SHA, and this quest reduces to the deletions, though
such a check also holds the fixer's mechanical fix on a low PR.

## Waiting

- kixel-ai/quest#868: lands its `quest review` commit status and the trust
  check that reads it. Check with `gh pr view 868 --repo kixel-ai/quest --json state`.

## Related

- [Risk records go stale when the base's risk file changes](/quest/m0/risk-base-stale.md) - another way a record stops covering the head
