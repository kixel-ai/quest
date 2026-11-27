# [M] A conflict-free merge of the base keeps a PR's review

## Goal

A review keeps counting for a head whose only changes since the reviewed head are conflict-free merges of the base, as `/quest-merge`'s rule already says, so `quest status` reads it `diff-identical` and `quest merge` takes it without a new review round.
Any change of the PR's own since the review, including one hidden in a merge commit, still reads `stale`.

`quest/core` holds the one comparison, so Kixel Quest's reads, which answer most `review-record` lines since reviews are posted there, judge a head as `quest`'s own GitHub reader does.

## Plan

Found 2026-11-27 in kixel-ai/kixel.quest, where [#207](https://github.com/kixel-ai/kixel.quest/pull/207), [#216](https://github.com/kixel-ai/kixel.quest/pull/216), and [#220](https://github.com/kixel-ai/kixel.quest/pull/220) each needed a full re-review round after GitHub's update-branch merged `main`.

The cause, measured on those PRs' six base merges, all conflict-free and identical to `git merge-tree`'s result: today's check compares the text of `git diff <base>...<head>` with the reviewed head's (`reviewRecord` in `src/github/status.ts`; Kixel Quest's `sameCode` and `samePatch` do the same). That text changes whenever the base touched a file the PR touches, through `index` blob lines, hunk line numbers, and context lines, though the PR's own lines do not. Four of the six read stale; ignoring `index` lines and hunk numbers still left three stale, from context lines alone; comparing only each file's removed and added lines left all six identical.

- Add to `quest/core` a pure comparison of two unified diffs: per file, in order, its header and mode lines and its removed and added lines, ignoring `index` lines, hunk headers, and context. A binary file compares by its `index` line, since its diff has no lines to compare.
- Count a head `diff-identical` only when that comparison matches and every commit after the reviewed head is a merge, so a writer's commit that moves a line without changing it still reads stale. A merge that edits beyond the base's changes shows up in the PR's own lines and reads stale too.
- Use it in `src/github/status.ts`'s `reviewRecord`, reading the commits between the two heads from the same compare.
- The "only on retry" answers: two of the six merges touched no file of the PR, so today's text check already reads them identical, and any stale answer there was transient. That is Kixel Quest's read to reproduce, not this quest's.

Tests: a fixture repository where the base edits lines next to the PR's hunks, merged without conflict, reads `diff-identical`; a writer's commit after the review, a moved line, a merge that adds a line of its own, and a binary file changed after the review each read `stale`. Check it a second way, against git on generated histories: every random conflict-free base merge whose tree is `git merge-tree`'s result reads identical, and the same merge with one random line added or removed reads stale.
