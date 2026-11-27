# [M] A conflict-free merge of the base keeps a PR's review

## Goal

A review keeps counting for a head whose only changes since the reviewed head are conflict-free merges of the base, as `/quest-merge`'s rule already says, so `quest status` reads it `diff-identical` and `quest merge` takes it without a new review round.
Any change of the PR's own since the review, including one hidden in a merge commit, still reads `stale`.

`quest/core` holds the one check, so Kixel Quest's reads, which answer most `review-record` lines since reviews are posted there, judge a head as `quest`'s own GitHub reader does.

## Plan

Found 2026-11-27 in kixel-ai/kixel.quest, where [#207](https://github.com/kixel-ai/kixel.quest/pull/207), [#216](https://github.com/kixel-ai/kixel.quest/pull/216), and [#220](https://github.com/kixel-ai/kixel.quest/pull/220) each needed a full re-review round after GitHub's update-branch merged `main`.

The cause, measured on those PRs' six base merges, all conflict-free and identical to `git merge-tree`'s result: today's check compares the text of `git diff <base>...<head>` with the reviewed head's (`reviewRecord` in `src/github/status.ts`; Kixel Quest's `sameCode` and `samePatch` do the same). That text changes whenever the base touched a file the PR touches, through `index` blob lines, hunk line numbers, and context lines, though the PR's own lines do not: four of the six read stale.

Agent's choice: check the merges themselves rather than loosen the diff comparison. A comparison of only removed and added lines read all six identical, but the review of this plan showed it would also carry a review onto a merge that moves a reviewed edit between two identical blocks, since it drops where each change sits.

- A head is `diff-identical` to the reviewed head, beside today's text match (which still covers a rebase), when its first-parent chain back to the reviewed head is only merges, each one's second parent is reachable from the base, and each one's tree is the conflict-free merge of its parents.
- Check each merge's tree with `quest/core`'s `merge` (`src/core/merge.ts`), git's own three-way file merge ported so a merge queue that cannot run git agrees byte for byte: a file both parents changed since their merge base must equal its clean merge, one only a parent changed must equal that parent's, and a merge with any conflict does not count. Git merges a binary file, or a path `.gitattributes` gives `-merge` or a driver other than `quest`, without a line merge, so such a path both parents changed does not count either. The `quest` driver this repository gives `quest/**` runs that same line merge first, so a quest file whose line merge is clean is checked like any text file, and its list resolution counts only as the decision below settles; whatever the check cannot establish as a clean merge keeps the review stale. Git's merge also detects renames, which a per-path merge does not, so a merge where either side renamed a file the other changed does not count either. Kixel Quest's Worker then runs the same check without git.
- Put the walk and the check in `quest/core`, given a way to read commits and blobs, and use it in `src/github/status.ts`'s `reviewRecord`.
- The "only on retry" answers: two of the six merges touched no file of the PR, so today's text check already reads them identical, and any stale answer there was transient. That is Kixel Quest's read to reproduce, not this quest's.

Tests: a fixture repository where the base edits lines next to the PR's hunks, merged without conflict, reads `diff-identical`, including after two such merges; a writer's commit after the review, a merge whose second parent is not on the base, a merge with a line of its own, a resolved conflict, and a binary file both sides changed each read `stale`; with this repository's `.gitattributes`, a clean merge of separate paragraphs in one quest file reads `diff-identical`. Check it a second way, against git on generated histories: the core's verdict on each random merge matches whether `git merge-tree --write-tree` of its parents succeeds with its tree.

## Waiting

- Maintainer: should a base merge whose only conflicts are quest link lists, which `quest resolve` merges item by item, also keep the review? `/quest-merge` today exempts only conflict-free base merges, and such list conflicts are the common kind in a quest tree.
  - Count them (Recommended) - the merge driver's result is deterministic and mechanical, as `resolveLists` in `src/core/merge.ts` computes it, so the check can verify it the same way; `/quest-merge`'s rule gains the case
  - Only conflict-free merges - keeps the rule as written, at a re-review round after each such merge
