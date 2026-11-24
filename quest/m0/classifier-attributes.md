# [S] The risk classifier sees every hunk, whatever the head's attributes say

## Goal

The risk classifier reads a head's whole change, however the head's
`.gitattributes` marks its files. A head can't hide the hunks that set its
own tier by marking them binary (`-diff`), either in the diff quest puts in
the prompt or in the per-path `git diff` the prompt asks the classifier to
run past the diff budget.

## Plan

Found in [kixel-ai/quest#838](https://github.com/kixel-ai/quest/pull/838):
with `src/lib.ts -diff` in the head's `.gitattributes`, the classifier's
prompt (`classify` in `src/cli/review.ts`) shows `Binary files a/src/lib.ts
and b/src/lib.ts differ` instead of the change. The diff dates from
[kixel-ai/quest#716](https://github.com/kixel-ai/quest/pull/716). #838 tried
adding `--attr-source=<empty tree>` to the diff and reverted it, since its
review found the rest of this work:

- The prompt's diff passes `--attr-source=<empty tree>`, as agy's diffs do.
- Past `DIFF_BUDGET`, the prompt holds only the stat and asks the classifier
  to read `git diff <range> -- <path>`. It should name
  `git --attr-source=<empty tree> diff <range> -- <path>` instead, with
  `classifyPrompt`'s test covering it.
- A tier saved before the change stays keyed to the same head, base, and
  risk file, so it's reused without the fixed diff. Add the diff's form to
  the classifier's cache key so those heads classify again.
- `--attr-source` needs Git 2.41 (June 2023), and every `quest review` that
  reaches the classifier would then need it. Ubuntu 22.04 ships 2.34 and
  Debian 12 ships 2.39. agy already refuses an older Git, since #838.

## Waiting

- Maintainer: pick what `quest review` does on a Git older than 2.41.
  - A usage error naming 2.41, checked once at the start (recommended). It
    fails loud and early, and the dev shell's Git is newer.
  - The plain diff there, which leaves the gap open on old Git and is a
    silent fallback the context's rules advise against.

  An agent can't pick, since it sets the oldest Git contributors can review
  with. Check: this quest's Plan records the pick.
